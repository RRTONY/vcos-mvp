"use client";

// Briefing Room data: meetings + questions (all records), the open record's
// entries / log / waiting / audit, and the previous record (for "What changed").
// Refreshes every 60 s, when the tab regains focus, and right after each save.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BAudit,
  BEntry,
  BLog,
  BMeeting,
  BQuestion,
  BWaiting,
} from "@/lib/briefing-view";

const API = "/api/briefing";
const POLL_MS = 60_000;

type Collection = "meetings" | "entries" | "audit" | "log" | "waiting" | "questions";

export interface BriefingAccess {
  canWrite: boolean;
  canAnswer: boolean;
  isAdmin: boolean;
  name: string;
}
export interface Attendance {
  recordings: { title: string; url: string; when: string }[];
  joined: string[];
  notSeen: string[];
  notLinked: string[];
}

async function list<T>(collection: Collection, meetingId?: string): Promise<T[]> {
  const qs = new URLSearchParams({ collection });
  if (meetingId) qs.set("meetingId", meetingId);
  const res = await fetch(`${API}?${qs}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Could not load ${collection}`);
  return (json.docs ?? []).map((d: { id: string; data: object }) => ({
    ...d.data,
    id: d.id,
  })) as T[];
}

async function write(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Not saved - try again");
  return json.id;
}

export function useBriefing() {
  const [access, setAccess] = useState<BriefingAccess | null>(null);
  const [meetings, setMeetings] = useState<BMeeting[] | null>(null);
  const [questions, setQuestions] = useState<BQuestion[]>([]);
  const [mid, setMid] = useState<string | null>(null);
  const [record, setRecord] = useState<{
    mid: string;
    entries: BEntry[];
    log: BLog[];
    waiting: BWaiting[];
    audit: BAudit[];
    prevEntries: BEntry[] | null; // null = not loaded yet
    prevWaiting: BWaiting[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const midRef = useRef<string | null>(null);
  midRef.current = mid;

  const prevMeeting = useCallback(
    (id: string | null, all: BMeeting[] | null) => {
      if (!id || !all) return null;
      const i = all.findIndex((m) => m.id === id);
      return i >= 0 ? (all[i + 1] ?? null) : null;
    },
    [],
  );

  const loadMeetings = useCallback(async () => {
    try {
      const [ms, qs] = await Promise.all([
        list<BMeeting>("meetings"),
        list<BQuestion>("questions"),
      ]);
      ms.sort((a, b) => String(b.date ?? b.id).localeCompare(String(a.date ?? a.id)));
      setMeetings(ms);
      setQuestions(qs);
      setError(null);
      if (!midRef.current || !ms.some((m) => m.id === midRef.current)) {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("br.mid");
        } catch {
          /* private mode */
        }
        setMid(ms.some((m) => m.id === saved) ? saved : (ms[0]?.id ?? null));
      }
      return ms;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  const loadRecord = useCallback(
    async (id: string, all: BMeeting[] | null) => {
      try {
        const prev = prevMeeting(id, all);
        const [entries, log, waiting, audit, prevEntries, prevWaiting] =
          await Promise.all([
            list<BEntry>("entries", id),
            list<BLog>("log", id),
            list<BWaiting>("waiting", id),
            list<BAudit>("audit", id),
            prev ? list<BEntry>("entries", prev.id) : Promise.resolve([]),
            prev ? list<BWaiting>("waiting", prev.id) : Promise.resolve([]),
          ]);
        if (midRef.current !== id) return; // user switched record meanwhile
        setRecord({ mid: id, entries, log, waiting, audit, prevEntries, prevWaiting });
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [prevMeeting],
  );

  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;
  const refresh = useCallback(async () => {
    const ms = await loadMeetings();
    const id = midRef.current;
    if (id) await loadRecord(id, ms ?? meetingsRef.current);
  }, [loadMeetings, loadRecord]);

  // First load + who is viewing
  useEffect(() => {
    fetch(`${API}?access=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a && setAccess(a))
      .catch(() => {});
    loadMeetings();
  }, [loadMeetings]);

  // Load the open record whenever it changes
  useEffect(() => {
    if (!mid) return;
    try {
      localStorage.setItem("br.mid", mid);
    } catch {
      /* private mode */
    }
    loadRecord(mid, meetingsRef.current);
  }, [mid, loadRecord]);

  // Poll + refresh on focus
  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (body: Record<string, unknown>) => {
      const id = await write(body);
      refresh();
      return id;
    },
    [refresh],
  );

  const meeting = meetings?.find((m) => m.id === mid) ?? null;
  const current = record && record.mid === mid ? record : null;

  return {
    access,
    meetings,
    meeting,
    prev: prevMeeting(mid, meetings),
    questions,
    mid,
    setMid,
    entries: current?.entries ?? [],
    log: current?.log ?? [],
    waiting: current?.waiting ?? [],
    audit: current?.audit ?? [],
    prevEntries: current?.prevEntries ?? [],
    prevWaiting: current?.prevWaiting ?? [],
    recordLoaded: !!current,
    error,
    update: (collection: Collection, id: string, data: object) =>
      mutate({ op: "update", collection, id, data }),
    set: (collection: Collection, id: string, data: object) =>
      mutate({ op: "set", collection, id, data }),
    remove: (collection: Collection, id: string) =>
      mutate({ op: "delete", collection, id }),
    add: (collection: Collection, data: object) =>
      mutate({ op: "add", collection, data }),
    listAll: list,
    attendance: async (meetingId: string): Promise<Attendance | null> => {
      const res = await fetch(`${API}?attendance=${meetingId}`, { cache: "no-store" });
      return res.ok ? res.json() : null;
    },
  };
}

export type BriefingData = ReturnType<typeof useBriefing>;
