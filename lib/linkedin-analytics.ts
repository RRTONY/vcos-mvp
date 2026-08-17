import { LINKEDIN_ACCOUNTS, type LinkedInAccountId } from "@/lib/constants";

const API_BASE = "https://api.linkedin.com/v2";

// Unlike X's OAuth 1.0a, LinkedIn's Marketing API just takes a plain OAuth 2.0
// Bearer access token per request - no request signing. That token comes from
// the Marketing Developer Platform's 3-legged authorization-code flow, which
// isn't runnable yet (no app has been created/approved - see §3 of the
// original handoff). Once one exists, minting the token is a one-time step
// like tony_x_oauth.py was for X; this file only needs the finished token.

interface LinkedInCredentials {
  accessToken: string;
  organizationId: string;
}

function credentialsFor(account: LinkedInAccountId): LinkedInCredentials {
  const cfg = LINKEDIN_ACCOUNTS.find((a) => a.id === account);
  if (!cfg) throw new Error(`Unknown LinkedIn account: ${account}`);

  const accessToken = process.env[cfg.accessTokenEnvVar];
  const organizationId = process.env[cfg.organizationIdEnvVar];
  if (!accessToken || !organizationId) {
    throw new Error(
      `LinkedIn credentials not configured for "${account}" - need ` +
        `${cfg.accessTokenEnvVar} and ${cfg.organizationIdEnvVar}. Requires a ` +
        `Marketing Developer Platform app (developer.linkedin.com), which ` +
        `hasn't been created/approved yet.`,
    );
  }
  return { accessToken, organizationId };
}

async function get<T>(
  account: LinkedInAccountId,
  path: string,
  query: Record<string, string>,
): Promise<T> {
  const { accessToken } = credentialsFor(account);
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API_BASE}${path}?${qs}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    throw new Error(
      `LinkedIn API ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

interface NetworkSizeResponse {
  firstDegreeSize: number;
}

interface ShareStatisticsResponse {
  elements: {
    totalShareStatistics: {
      impressionCount: number;
      clickCount: number;
      likeCount: number;
      commentCount: number;
      shareCount: number;
      engagement: number;
    };
  }[];
}

export interface LinkedInSnapshot {
  account: LinkedInAccountId;
  followersCount: number;
  lifetime: {
    impressions: number;
    clicks: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

export async function buildLinkedInSnapshot(
  account: LinkedInAccountId,
): Promise<LinkedInSnapshot> {
  const { organizationId } = credentialsFor(account);
  const org = `urn:li:organization:${organizationId}`;

  const [network, shareStats] = await Promise.all([
    get<NetworkSizeResponse>(
      account,
      `/networkSizes/${encodeURIComponent(org)}`,
      { edgeType: "CompanyFollowedByMember" },
    ),
    get<ShareStatisticsResponse>(account, "/organizationalEntityShareStatistics", {
      q: "organizationalEntity",
      organizationalEntity: org,
    }),
  ]);

  // Lifetime totals, not a rolling window - organizationalEntityShareStatistics
  // without a timeIntervals param returns the all-time aggregate, which is the
  // most reliably-documented shape of this endpoint. A 7-day window (to match
  // the X tabs) is a reasonable follow-up once there's a real app to verify
  // the time-range params against.
  const totals = shareStats.elements[0]?.totalShareStatistics;

  return {
    account,
    followersCount: network.firstDegreeSize,
    lifetime: {
      impressions: totals?.impressionCount ?? 0,
      clicks: totals?.clickCount ?? 0,
      likes: totals?.likeCount ?? 0,
      comments: totals?.commentCount ?? 0,
      shares: totals?.shareCount ?? 0,
    },
  };
}
