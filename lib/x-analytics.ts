import { createHmac, randomBytes } from "crypto";
import { X_ACCOUNTS, type XAccountId } from "@/lib/constants";

const API_BASE = "https://api.twitter.com/2";

// ─── OAuth 1.0a request signing (HMAC-SHA1) ──────────────────────────────────
// User-context auth is required here (not an app-only Bearer token) because
// impression/engagement counts on your own tweets are only exposed to the
// authenticated author, not as public data. Signing by hand (rather than
// pulling in a library) mirrors the JWT-signing approach already used for
// GA4 in lib/google-analytics.ts.

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

interface OAuth1Credentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function credentialsFor(account: XAccountId): OAuth1Credentials {
  const cfg = X_ACCOUNTS.find((a) => a.id === account);
  if (!cfg) throw new Error(`Unknown X account: ${account}`);

  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_KEY_SECRET;
  const accessToken = process.env[cfg.accessTokenEnvVar];
  const accessTokenSecret = process.env[cfg.accessTokenSecretEnvVar];

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      `X credentials not configured for "${account}" - need X_CONSUMER_KEY, ` +
        `X_CONSUMER_KEY_SECRET, ${cfg.accessTokenEnvVar}, ${cfg.accessTokenSecretEnvVar}`,
    );
  }
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}

function oauth1Header(
  method: string,
  url: string,
  queryParams: Record<string, string>,
  creds: OAuth1Credentials,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...queryParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
      .join(", ")
  );
}

async function signedGet<T>(
  account: XAccountId,
  path: string,
  query: Record<string, string> = {},
): Promise<T> {
  const creds = credentialsFor(account);
  const url = `${API_BASE}${path}`;
  const qs = new URLSearchParams(query).toString();
  const fullUrl = qs ? `${url}?${qs}` : url;

  const res = await fetch(fullUrl, {
    headers: { Authorization: oauth1Header("GET", url, query, creds) },
  });
  if (!res.ok) {
    throw new Error(`X API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ─── X API v2 shapes ──────────────────────────────────────────────────────────

interface UserMeResponse {
  data: {
    id: string;
    username: string;
    name: string;
    public_metrics: {
      followers_count: number;
      following_count: number;
      tweet_count: number;
      listed_count: number;
    };
  };
}

interface TweetsResponse {
  data?: {
    id: string;
    text: string;
    created_at: string;
    public_metrics: {
      retweet_count: number;
      reply_count: number;
      like_count: number;
      quote_count: number;
      impression_count?: number;
    };
  }[];
}

export interface XTweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  engagementCount: number;
}

export interface XSnapshot {
  account: XAccountId;
  username: string;
  name: string;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  listedCount: number;
  last7d: {
    tweetsPosted: number;
    impressions: number;
    engagements: number;
  };
  topTweets: XTweet[];
}

function toXTweet(t: NonNullable<TweetsResponse["data"]>[number]): XTweet {
  const m = t.public_metrics;
  const engagementCount = m.like_count + m.retweet_count + m.reply_count + m.quote_count;
  return {
    id: t.id,
    text: t.text,
    createdAt: t.created_at,
    likeCount: m.like_count,
    retweetCount: m.retweet_count,
    replyCount: m.reply_count,
    quoteCount: m.quote_count,
    impressionCount: m.impression_count ?? 0,
    engagementCount,
  };
}

export async function buildXSnapshot(account: XAccountId): Promise<XSnapshot> {
  const me = await signedGet<UserMeResponse>(account, "/users/me", {
    "user.fields": "public_metrics",
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const tweets = await signedGet<TweetsResponse>(
    account,
    `/users/${me.data.id}/tweets`,
    {
      max_results: "25",
      exclude: "retweets,replies",
      start_time: sevenDaysAgo,
      "tweet.fields": "public_metrics,created_at",
    },
  );

  const recent = (tweets.data ?? []).map(toXTweet);
  const topTweets = [...recent]
    .sort((a, b) => b.engagementCount - a.engagementCount)
    .slice(0, 5);

  return {
    account,
    username: me.data.username,
    name: me.data.name,
    followersCount: me.data.public_metrics.followers_count,
    followingCount: me.data.public_metrics.following_count,
    tweetCount: me.data.public_metrics.tweet_count,
    listedCount: me.data.public_metrics.listed_count,
    last7d: {
      tweetsPosted: recent.length,
      impressions: recent.reduce((sum, t) => sum + t.impressionCount, 0),
      engagements: recent.reduce((sum, t) => sum + t.engagementCount, 0),
    },
    topTweets,
  };
}
