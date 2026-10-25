(function () {
  "use strict";

  var KEY = "trip-planner-v1";
  var NLEGS = 10;
  var DAY = 86400000;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ---------- data ----------
  function freshTrip() {
    var legs = [];
    var starters = [
      ["Inland south", "Durren Durren → Yarrawonga → Mildura → Geelong"],
      ["Tasmania", "Devonport loop, Spirit of Tasmania both ways"],
      ["Coast north", "Geelong → coast → Brisbane"]
    ];
    for (var i = 1; i <= NLEGS; i++) {
      var s = starters[i - 1];
      legs.push({ n: i, name: s ? s[0] : "", route: s ? s[1] : "" });
    }
    return { version: 1, legs: legs, stops: [], lastBackup: null, changedSinceBackup: false };
  }

  function normalise(t) {
    var base = freshTrip();
    if (!t || typeof t !== "object") return base;
    var legs = base.legs.map(function (l) {
      var found = (t.legs || []).filter(function (x) { return +x.n === l.n; })[0];
      return found ? { n: l.n, name: String(found.name || ""), route: String(found.route || "") } : l;
    });
    var stops = (t.stops || []).map(function (s) {
      return {
        id: String(s.id || uid()),
        leg: s.leg ? +s.leg : "",
        arrive: s.arrive || "", depart: s.depart || "",
        location: String(s.location || ""), stay: String(s.stay || ""), site: String(s.site || ""),
        dog: String(s.dog || ""), booked: String(s.booked || ""),
        cost: s.cost === "" || s.cost == null ? "" : +s.cost,
        km: s.km === "" || s.km == null ? "" : +s.km,
        notes: String(s.notes || ""),
        web: cleanUrl(s.web), map: cleanUrl(s.map)
      };
    });
    return { version: 1, legs: legs, stops: stops, lastBackup: t.lastBackup || null, changedSinceBackup: !!t.changedSinceBackup };
  }

  function load() {
    try { return normalise(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return freshTrip(); }
  }
  function save() {
    trip.changedSinceBackup = true;
    try { localStorage.setItem(KEY, JSON.stringify(trip)); }
    catch (e) { toast("Couldn't save on this phone. Storage may be full."); }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Only keep web links; add https:// when someone pastes "hipcamp.com/..."
  function cleanUrl(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
    try { var u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch (e) { return ""; }
  }

  var trip = load();

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ms(iso) { if (!iso) return NaN; var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function nights(s) { var a = ms(s.arrive), d = ms(s.depart); return isNaN(a) || isNaN(d) ? null : Math.round((d - a) / DAY); }
  function fmt(iso, withYear) {
    var t = ms(iso); if (isNaN(t)) return "";
    var d = new Date(t);
    return DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + (withYear ? " " + d.getUTCFullYear() : "");
  }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-AU"); }
  function km(n) { return Math.round(n).toLocaleString("en-AU") + " km"; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function legColour(n) { return n ? "var(--l" + n + ")" : "var(--line)"; }
  function legName(n) { var l = trip.legs[n - 1]; return l && l.name ? l.name : "Leg " + n; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  function totals(stops) {
    var t = { nights: 0, km: 0, cost: 0, stops: 0, booked: 0, dog: 0, first: "", last: "" };
    stops.forEach(function (s) {
      var n = nights(s); if (n > 0) t.nights += n;
      t.km += num(s.km); t.cost += num(s.cost);
      if (s.location.trim()) t.stops++;
      if (s.booked === "Yes") t.booked++;
      if (s.dog === "Yes") t.dog++;
      if (s.arrive && (!t.first || s.arrive < t.first)) t.first = s.arrive;
      if (s.depart && (!t.last || s.depart > t.last)) t.last = s.depart;
    });
    return t;
  }

  function byDate(a, b) {
    var x = a.arrive || "9999", y = b.arrive || "9999";
    return x < y ? -1 : x > y ? 1 : 0;
  }

  var toastTimer;
  function toast(msg) {
    var el = $("toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------- stops view ----------
  var filter = "all";

  function renderSummary() {
    var t = totals(trip.stops);
    var all = trip.stops.length;
    var stats = [
      ["Dates", t.first ? fmt(t.first, true) + " – " + fmt(t.last || t.first, true) : "Add a stop to start", true],
      ["Nights", t.nights], ["Stops", t.stops],
      ["Driving", km(t.km)], ["Costs", money(t.cost)],
      ["Booked", t.booked + " of " + all], ["Dog OK", t.dog + " of " + all]
    ];
    $("summary").innerHTML = stats.map(function (s) {
      return '<div class="stat' + (s[2] ? " wide" : "") + '"><div class="k">' + s[0] + '</div><div class="v">' + esc(s[1]) + "</div></div>";
    }).join("");
  }

  function badge(label, v) {
    if (!v) return "";
    var cls = v === "Yes" ? "yes" : v === "No" ? "no" : "chk";
    var text = v === "Yes" ? label + " ✓" : v === "No" ? label + " ✗" : label + " ?";
    return '<span class="badge ' + cls + '">' + esc(text) + "</span>";
  }

  function place(q) { return /australia/i.test(q) ? q : q + ", Australia"; }
  function mapUrl(s) {
    if (s.map) return s.map;
    var q = [s.stay, s.location].filter(function (x) { return x && x.trim(); }).join(", ");
    return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place(q)) : "";
  }
  function webLabel(url) {
    try { var h = new URL(url).hostname.replace(/^www\./, ""); return /hipcamp/i.test(h) ? "Hipcamp" : "Website"; } catch (e) { return "Website"; }
  }
  // Google Maps directions through a leg's stops, split into parts of up to 10 places
  function routeLinks(stops) {
    var places = stops.slice().sort(byDate).map(function (s) { return s.location.trim(); }).filter(Boolean);
    places = places.filter(function (p, i) { return i === 0 || p.toLowerCase() !== places[i - 1].toLowerCase(); });
    if (places.length < 2) return [];
    var parts = [], size = 10;
    for (var i = 0; i < places.length - 1; i += size - 1) parts.push(places.slice(i, i + size));
    return parts.map(function (p) {
      return "https://www.google.com/maps/dir/" + p.map(function (x) { return encodeURIComponent(place(x)); }).join("/") + "/";
    });
  }

  function stopCard(s) {
    var n = nights(s);
    var bad = n != null && n < 0;
    var when = s.arrive || s.depart
      ? (fmt(s.arrive) || "?") + " → " + (fmt(s.depart) || "?") + (n != null ? " · " + (bad ? "depart is before arrive" : plural(n, "night")) : "")
      : "No dates yet";
    var badges = [];
    if (s.site) badges.push('<span class="badge">' + esc(s.site) + "</span>");
    badges.push(badge("Booked", s.booked));
    badges.push(badge("Dog", s.dog));
    if (s.km !== "" && s.km != null) badges.push('<span class="badge">' + km(num(s.km)) + "</span>");
    if (s.cost !== "" && s.cost != null) badges.push('<span class="badge">' + money(num(s.cost)) + "</span>");
    var links = [];
    var m = mapUrl(s);
    if (m) links.push('<a href="' + esc(m) + '" target="_blank" rel="noopener">Map</a>');
    if (s.web) links.push('<a href="' + esc(s.web) + '" target="_blank" rel="noopener">' + webLabel(s.web) + "</a>");
    return '<div class="card" style="border-left-color:' + legColour(s.leg) + '">' +
      '<button class="card-main" type="button" data-id="' + esc(s.id) + '" aria-label="Edit ' + esc(s.location || "stop") + '">' +
      '<div class="when' + (bad ? " bad" : "") + '">' + esc(when) + "</div>" +
      '<div class="where">' + esc(s.location || "Unnamed stop") + "</div>" +
      (s.stay ? '<div class="stay">' + esc(s.stay) + "</div>" : "") +
      '<div class="badges">' + badges.join("") + "</div>" +
      (s.notes ? '<div class="notes">' + esc(s.notes) + "</div>" : "") +
      "</button>" +
      (links.length ? '<div class="card-links">' + links.join("") + "</div>" : "") +
      "</div>";
  }

  function renderStops() {
    var el = $("stops");
    var list = trip.stops.slice().sort(byDate);
    if (filter === "notbooked") list = list.filter(function (s) { return s.booked !== "Yes"; });
    if (filter === "dog") list = list.filter(function (s) { return s.dog !== "Yes"; });

    if (!trip.stops.length) {
      el.innerHTML = '<div class="empty"><strong>No stops yet</strong>Tap “+ Add stop” to put in your first stop. Pick its leg, dates and where you’re staying.</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div class="empty"><strong>Nothing to show</strong>' +
        (filter === "notbooked" ? "Every stop is booked." : "Every stop is confirmed as dog-friendly.") + "</div>";
      return;
    }
    var groups = [];
    for (var n = 1; n <= NLEGS; n++) groups.push({ n: n, stops: [] });
    var none = { n: "", stops: [] };
    list.forEach(function (s) { (s.leg ? groups[s.leg - 1] : none).stops.push(s); });
    groups.push(none);

    el.innerHTML = groups.filter(function (g) { return g.stops.length; }).map(function (g) {
      var all = trip.stops.filter(function (s) { return (s.leg || "") === g.n; });
      var t = totals(all);
      var title = g.n ? "Leg " + g.n + " · " + legName(g.n) : "No leg chosen";
      var meta = [];
      if (t.first) meta.push(fmt(t.first) + " – " + fmt(t.last || t.first));
      meta.push(plural(t.nights, "night"));
      if (t.km) meta.push(km(t.km));
      if (t.cost) meta.push(money(t.cost));
      var routes = routeLinks(all);
      var routeHtml = routes.length ? '<div class="route-links">' + routes.map(function (u, i) {
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + (routes.length > 1 ? "Route map, part " + (i + 1) : "Route map") + "</a>";
      }).join("") + "</div>" : "";
      return '<div class="leg"><div class="leg-head"><span class="dot" style="background:' + legColour(g.n) + '"></span><div>' +
        "<h2>" + esc(title) + '</h2><div class="meta">' + esc(meta.join(" · ")) + "</div>" + routeHtml + "</div></div>" +
        g.stops.map(stopCard).join("") + "</div>";
    }).join("");
  }

  $("stops").addEventListener("click", function (e) {
    var c = e.target.closest(".card-main"); if (c) openEditor(c.dataset.id);
  });
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderStops();
    });
  });

  // ---------- legs view ----------
  function renderLegs() {
    $("legs").innerHTML = trip.legs.map(function (l) {
      var t = totals(trip.stops.filter(function (s) { return s.leg === l.n; }));
      var tot = t.stops
        ? plural(t.stops, "stop") + " · " + plural(t.nights, "night") + (t.first ? " · " + fmt(t.first) + " – " + fmt(t.last || t.first) : "") + (t.km ? " · " + km(t.km) : "") + (t.cost ? " · " + money(t.cost) : "")
        : "No stops yet";
      return '<div class="leg-row">' +
        '<span class="leg-num" style="background:' + legColour(l.n) + '">' + l.n + "</span>" +
        '<input type="text" id="leg-name-' + l.n + '" data-leg="' + l.n + '" data-f="name" value="' + esc(l.name) + '" placeholder="Leg ' + l.n + ' title" aria-label="Leg ' + l.n + ' title">' +
        '<input class="route" type="text" id="leg-route-' + l.n + '" data-leg="' + l.n + '" data-f="route" value="' + esc(l.route) + '" placeholder="Route (optional)" aria-label="Leg ' + l.n + ' route">' +
        '<div class="totals">' + esc(tot) + "</div></div>";
    }).join("");
  }
  $("legs").addEventListener("input", function (e) {
    var t = e.target; if (!t.dataset.leg) return;
    trip.legs[+t.dataset.leg - 1][t.dataset.f] = t.value;
    save();
  });

  // ---------- editor ----------
  var editing = null;
  var dlg = $("editor");

  function fillLegOptions(selected) {
    $("f-leg").innerHTML = '<option value="">No leg</option>' + trip.legs.map(function (l) {
      return '<option value="' + l.n + '"' + (l.n === selected ? " selected" : "") + ">" + esc("Leg " + l.n + (l.name ? " · " + l.name : "")) + "</option>";
    }).join("");
  }
  function setSeg(field, v) {
    document.querySelectorAll('.seg[data-field="' + field + '"] button').forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
  }
  function getSeg(field) {
    var b = document.querySelector('.seg[data-field="' + field + '"] button[aria-pressed="true"]');
    return b ? b.dataset.v : "";
  }
  document.querySelectorAll(".seg").forEach(function (seg) {
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setSeg(seg.dataset.field, b.dataset.v); });
  });

  function updateNightsNote() {
    var n = nights({ arrive: $("f-arrive").value, depart: $("f-depart").value });
    var el = $("f-nights");
    el.className = "nights-note" + (n != null && n < 0 ? " bad" : "");
    el.textContent = n == null ? "" : n < 0 ? "The depart date is before the arrive date." : plural(n, "night");
  }
  $("f-arrive").addEventListener("input", updateNightsNote);
  $("f-depart").addEventListener("input", updateNightsNote);

  function openEditor(id) {
    var s = id ? trip.stops.filter(function (x) { return x.id === id; })[0] : null;
    if (!s) {
      var last = trip.stops.slice().sort(byDate).pop();
      s = { id: "", leg: last ? last.leg : (trip.legs[0].name ? 1 : ""), arrive: last ? last.depart : "", depart: "", location: "", stay: "", site: "", dog: "", booked: "", cost: "", km: "", notes: "", web: "", map: "" };
    }
    editing = s.id || null;
    $("editor-title").textContent = editing ? "Edit stop" : "New stop";
    fillLegOptions(s.leg);
    $("f-location").value = s.location;
    $("f-arrive").value = s.arrive;
    $("f-depart").value = s.depart;
    $("f-stay").value = s.stay;
    $("f-site").value = s.site;
    setSeg("dog", s.dog); setSeg("booked", s.booked);
    $("f-cost").value = s.cost;
    $("f-km").value = s.km;
    $("f-notes").value = s.notes;
    $("f-web").value = s.web || "";
    $("f-map").value = s.map || "";
    $("delete-stop").hidden = !editing;
    updateNightsNote();
    dlg.showModal();
    if (!editing) setTimeout(function () { $("f-location").focus(); }, 50);
  }

  $("stop-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var s = {
      id: editing || uid(),
      leg: $("f-leg").value ? +$("f-leg").value : "",
      arrive: $("f-arrive").value, depart: $("f-depart").value,
      location: $("f-location").value.trim(), stay: $("f-stay").value.trim(), site: $("f-site").value,
      dog: getSeg("dog"), booked: getSeg("booked"),
      cost: $("f-cost").value === "" ? "" : +$("f-cost").value,
      km: $("f-km").value === "" ? "" : +$("f-km").value,
      notes: $("f-notes").value.trim(),
      web: cleanUrl($("f-web").value), map: cleanUrl($("f-map").value)
    };
    if (editing) trip.stops = trip.stops.map(function (x) { return x.id === editing ? s : x; });
    else trip.stops.push(s);
    save(); dlg.close(); renderAll();
    var badLink = ($("f-web").value.trim() && !s.web) || ($("f-map").value.trim() && !s.map);
    toast(badLink ? "Stop saved, but a link didn't look like a web address, so it was left out" : editing ? "Stop saved" : "Stop added");
  });
  function closeEditor() { dlg.close(); }
  $("editor-close").addEventListener("click", closeEditor);
  $("editor-cancel").addEventListener("click", closeEditor);

  var deleteArmed = false;
  $("delete-stop").addEventListener("click", function () {
    var b = $("delete-stop");
    if (!deleteArmed) { deleteArmed = true; b.textContent = "Tap again to delete"; setTimeout(function () { deleteArmed = false; b.textContent = "Delete this stop"; }, 3000); return; }
    deleteArmed = false; b.textContent = "Delete this stop";
    trip.stops = trip.stops.filter(function (x) { return x.id !== editing; });
    save(); dlg.close(); renderAll(); toast("Stop deleted");
  });

  $("add-stop").addEventListener("click", function () { openEditor(null); });

  // ---------- backup ----------
  function stamp() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function backupBlob() {
    var copy = { app: "Trip Planner", version: 1, savedAt: new Date().toISOString(), legs: trip.legs, stops: trip.stops };
    return new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
  }
  function markBackedUp() {
    trip.lastBackup = new Date().toISOString(); trip.changedSinceBackup = false;
    try { localStorage.setItem(KEY, JSON.stringify(trip)); } catch (e) {}
    renderBackup();
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  $("save-backup").addEventListener("click", function () {
    download(backupBlob(), "trip-backup-" + stamp() + ".json");
    markBackedUp(); toast("Backup saved to your Downloads");
  });
  $("share-backup").addEventListener("click", function () {
    var file = new File([backupBlob()], "trip-backup-" + stamp() + ".json", { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: "Trip Planner backup" })
        .then(function () { markBackedUp(); toast("Backup shared"); })
        .catch(function (err) { if (err && err.name !== "AbortError") toast("Couldn't share. Try Save backup file instead."); });
    } else {
      download(file, file.name); markBackedUp(); toast("Sharing isn't available here, so the backup went to Downloads");
    }
  });

  $("restore-file").addEventListener("change", function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.stops) || !Array.isArray(data.legs)) throw new Error("bad");
        var keep = { lastBackup: trip.lastBackup };
        trip = normalise(data); trip.lastBackup = keep.lastBackup; trip.changedSinceBackup = false;
        localStorage.setItem(KEY, JSON.stringify(trip));
        renderAll(); toast("Trip restored: " + plural(trip.stops.length, "stop"));
      } catch (err) { toast("That file isn't a Trip Planner backup."); }
      e.target.value = "";
    };
    r.readAsText(f);
  });

  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $("save-csv").addEventListener("click", function () {
    var rows = [["Leg #", "Leg", "Arrive", "Depart", "Nights", "Location", "Where we're staying", "Site type", "Dog OK?", "Booked?", "Cost (AUD)", "Drive (km)", "Notes", "Website", "Map"]];
    trip.stops.slice().sort(byDate).forEach(function (s) {
      var n = nights(s);
      rows.push([s.leg, s.leg ? legName(s.leg) : "", s.arrive, s.depart, n == null ? "" : n, s.location, s.stay, s.site, s.dog, s.booked, s.cost, s.km, s.notes, s.web, mapUrl(s)]);
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    download(new Blob([csv], { type: "text/csv" }), "trip-" + stamp() + ".csv");
    toast("Spreadsheet saved to your Downloads");
  });

  function renderBackup() {
    $("last-backup").textContent = trip.lastBackup
      ? "Last backup: " + new Date(trip.lastBackup).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "You haven't saved a backup yet.";
    var stale = trip.stops.length && trip.changedSinceBackup && (!trip.lastBackup || Date.now() - Date.parse(trip.lastBackup) > 7 * DAY);
    $("backup-banner").hidden = !stale;
  }
  $("banner-go").addEventListener("click", function () { show("backup"); });

  function renderStorage() {
    var el = $("storage-status");
    if (!navigator.storage || !navigator.storage.persisted) { el.textContent = "Your trip is saved in this app on this phone."; return; }
    navigator.storage.persisted().then(function (p) {
      el.textContent = p
        ? "Your trip is saved on this phone, and Android has agreed to keep it safe from automatic clean-ups."
        : "Your trip is saved on this phone. Install the app to your home screen so Android keeps it safe from automatic clean-ups.";
    });
  }

  // ---------- navigation ----------
  function show(view) {
    ["stops", "legs", "backup"].forEach(function (v) { $("view-" + v).hidden = v !== view; });
    document.querySelectorAll("nav.tabs button").forEach(function (b) {
      if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("add-stop").hidden = view !== "stops";
    if (view === "legs") renderLegs();
    if (view === "stops") renderAll();
    if (view === "backup") { renderBackup(); renderStorage(); }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("nav.tabs button").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.view); }); });

  function renderAll() { renderSummary(); renderStops(); renderBackup(); }

  renderAll();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
