// Briefing Room → VCoS adapter.
// The page was written against a document database (claude.use('db')) and a
// viewer identity (claude.use('user')). This file provides both on top of the
// VCoS /api/briefing endpoint, so the page's markup, CSS and logic stay as-is.
// Live updates become polling: every 60 s, when the tab regains focus, and
// right after each save.
(function () {
  var API = "/api/briefing";
  var POLL_MS = 60000;
  var subs = new Set();

  function errFrom(status, message) {
    var e = new Error(message || "HTTP " + status);
    e.code =
      status === 401 ? "unauthenticated" :
      status === 403 ? "permission-denied" :
      status === 404 ? "not-found" : "unavailable";
    return e;
  }

  async function call(method, params, body) {
    var url = API + (params ? "?" + new URLSearchParams(params) : "");
    var res = await fetch(url, {
      method: method,
      cache: "no-store",
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) throw errFrom(res.status, json.error);
    return json;
  }

  function snapshot(docs) {
    return {
      docs: docs.map(function (d) {
        return { id: d.id, data: function () { return d.data; } };
      }),
    };
  }

  function Query(collection, meetingId, order) {
    this.c = collection;
    this.m = meetingId == null ? null : meetingId;
    this.o = order || null;
  }
  Query.prototype.where = function (field, op, value) {
    if (field !== "meetingId" || op !== "==")
      throw new Error('Only where("meetingId", "==", …) is supported');
    return new Query(this.c, value, this.o);
  };
  Query.prototype.orderBy = function (field, dir) {
    return new Query(this.c, this.m, { field: field, desc: dir === "desc" });
  };
  Query.prototype.fetch = async function () {
    var p = { collection: this.c };
    if (this.m != null) p.meetingId = this.m;
    var docs = (await call("GET", p)).docs || [];
    var o = this.o;
    if (o) {
      docs.sort(function (a, b) {
        var x = String(a.data[o.field] == null ? "" : a.data[o.field]);
        var y = String(b.data[o.field] == null ? "" : b.data[o.field]);
        return (x < y ? -1 : x > y ? 1 : 0) * (o.desc ? -1 : 1);
      });
    }
    return docs;
  };
  Query.prototype.get = async function () {
    return snapshot(await this.fetch());
  };
  Query.prototype.onSnapshot = function (onNext, onError) {
    var sub = { q: this, onNext: onNext, onError: onError, last: null, live: true };
    subs.add(sub);
    poll(sub);
    return function () { sub.live = false; subs.delete(sub); };
  };
  Query.prototype.doc = function (id) {
    return new DocRef(this.c, id);
  };
  Query.prototype.add = async function (data) {
    var res = await call("POST", null, { op: "add", collection: this.c, data: data });
    refreshSoon();
    return new DocRef(this.c, res.id);
  };

  function DocRef(collection, id) { this.c = collection; this.id = id; }
  function write(op) {
    return async function (data) {
      await call("POST", null, { op: op, collection: this.c, id: this.id, data: data });
      refreshSoon();
    };
  }
  DocRef.prototype.set = write("set");
  DocRef.prototype.update = write("update");
  DocRef.prototype.delete = write("delete");

  async function poll(sub) {
    try {
      var docs = await sub.q.fetch();
      var sig = JSON.stringify(docs);
      if (sub.live && sig !== sub.last) {
        sub.last = sig;
        sub.onNext(snapshot(docs));
      }
    } catch (e) {
      if (sub.live && sub.onError) sub.onError(e);
    }
  }
  function refreshAll() { subs.forEach(poll); }
  var soonTimer = null;
  function refreshSoon() { clearTimeout(soonTimer); soonTimer = setTimeout(refreshAll, 250); }
  setInterval(refreshAll, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshAll();
  });

  var db = { collection: function (c) { return new Query(c); } };

  var access = null;
  function getAccess() {
    if (!access) access = call("GET", { access: "1" });
    return access;
  }
  var user = {
    can: async function (perm) {
      var a = await getAccess();
      if (perm === "data.write") return !!a.canWrite;
      if (perm === "questions.answer") return !!a.canAnswer;
      if (perm === "admin") return !!a.isAdmin;
      return false;
    },
    me: async function () {
      var a = await getAccess();
      return { name: a.name };
    },
  };

  // VCoS extra: team-meeting attendance from Fireflies for a meeting date.
  window.vcos = {
    attendance: function (meetingId) {
      return call("GET", { attendance: meetingId });
    },
  };

  window.claude = {
    use: function (name) {
      if (name === "db") return Promise.resolve(db);
      if (name === "user") return getAccess().then(function () { return user; });
      return Promise.reject(new Error("Not available in VCoS: " + name));
    },
  };
})();
