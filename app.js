(function () {
  "use strict";

  var KEY = "trip-planner-v2";
  var OLD_KEY = "trip-planner-v1"; // single-trip version; read once and kept as it was
  var NLEGS = 10;
  var DAY = 86400000;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ---------- data ----------
  // store = { version: 2, current: tripId, trips: [{ id, name, legs, stops }], lastBackup, changedSinceBackup }
  var STARTERS = [
    ["Inland south", "Durren Durren → Yarrawonga → Mildura → Geelong"],
    ["Tasmania", "Devonport loop, Spirit of Tasmania both ways"],
    ["Coast north", "Geelong → coast → Brisbane"]
  ];
  function blankLegs(starters) {
    var legs = [];
    for (var i = 1; i <= NLEGS; i++) {
      var s = starters[i - 1];
      legs.push({ n: i, name: s ? s[0] : "", route: s ? s[1] : "" });
    }
    return legs;
  }
  function freshTrip(name, starters) {
    return { id: uid(), name: name || "My trip", legs: blankLegs(starters || []), stops: [], away: [] };
  }
  function freshStore() {
    var t = freshTrip("My trip", STARTERS);
    return { version: 2, current: t.id, trips: [t], lastBackup: null, changedSinceBackup: false };
  }

  function normaliseTrip(t) {
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
        web: cleanUrl(s.web), map: cleanUrl(s.map),
        geo: cleanGeo(s.geo)
      };
    });
    // Times away for work: { id, leave, back, from, notes }
    var away = (Array.isArray(t.away) ? t.away : []).filter(function (a) { return a && a.leave && a.back; }).map(function (a) {
      return { id: String(a.id || uid()), leave: String(a.leave), back: String(a.back), from: String(a.from || ""), notes: String(a.notes || "") };
    });
    return { id: String(t.id || uid()), name: String(t.name || "My trip").trim() || "My trip", legs: legs, stops: stops, away: away };
  }

  // Accepts the current format, or the older one-trip format (which becomes the first trip)
  function normaliseStore(s) {
    if (!s || typeof s !== "object") return freshStore();
    if (!Array.isArray(s.trips)) {
      var only = normaliseTrip(s);
      return { version: 2, current: only.id, trips: [only], lastBackup: s.lastBackup || null, changedSinceBackup: !!s.changedSinceBackup };
    }
    var trips = s.trips.map(normaliseTrip);
    if (!trips.length) return freshStore();
    var current = trips.some(function (t) { return t.id === s.current; }) ? s.current : trips[0].id;
    return { version: 2, current: current, trips: trips, lastBackup: s.lastBackup || null, changedSinceBackup: !!s.changedSinceBackup };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normaliseStore(JSON.parse(raw));
      var old = localStorage.getItem(OLD_KEY);
      if (old) {
        var moved = normaliseStore(JSON.parse(old));
        localStorage.setItem(KEY, JSON.stringify(moved));
        return moved;
      }
    } catch (e) {}
    return freshStore();
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) { toast("Couldn't save on this phone. Storage may be full."); }
  }
  function save() { store.changedSinceBackup = true; persist(); }
  function currentTrip() { return store.trips.filter(function (t) { return t.id === store.current; })[0] || store.trips[0]; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Where a stop's location was found on the map: { q: the location searched, lat, lng } or { q, none: true }
  function cleanGeo(g) {
    if (!g || typeof g !== "object" || !g.q) return null;
    if (g.none) return { q: String(g.q), none: true };
    var lat = +g.lat, lng = +g.lng;
    return isFinite(lat) && isFinite(lng) ? { q: String(g.q), lat: lat, lng: lng } : null;
  }

  // Only keep web links; add https:// when someone pastes "hipcamp.com/..."
  function cleanUrl(v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = "https://" + v;
    try { var u = new URL(v); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch (e) { return ""; }
  }

  var store = load();
  var trip = currentTrip();

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

  // ---------- away for work ----------
  function awaySorted() { return trip.away.slice().sort(function (a, b) { return a.leave < b.leave ? -1 : a.leave > b.leave ? 1 : 0; }); }
  function awayNights(a) { return Math.round((ms(a.back) - ms(a.leave)) / DAY); }
  // Nights of a stop that fall while he's away (a stop with only an arrive date counts its first night)
  function awayDays(s) {
    var a = ms(s.arrive), d = ms(s.depart), days = [];
    if (isNaN(a)) return days;
    if (isNaN(d) || d <= a) d = a + DAY;
    for (var t = a; t < d; t += DAY) {
      if (trip.away.some(function (w) { return t >= ms(w.leave) && t < ms(w.back); })) days.push(t);
    }
    return days;
  }
  function isAway(s) { return awayDays(s).length > 0; }
  function awayNightsIn(stops) {
    var seen = {};
    stops.forEach(function (s) { if (s.depart) awayDays(s).forEach(function (t) { seen[t] = 1; }); });
    return Object.keys(seen).length;
  }

  // Where each away band sits in the stops list: before the stop he leaves on, after the stop he leaves during,
  // otherwise before the next stop or after the last one. With no dated stops it goes at the top.
  function placeAway(list) {
    var dated = list.filter(function (s) { return s.arrive; });
    var place = { before: {}, after: {}, loose: [] };
    awaySorted().forEach(function (w) {
      var during = dated.filter(function (s) { return s.arrive < w.leave && s.depart && s.depart > w.leave; })[0];
      var next = dated.filter(function (s) { return s.arrive >= w.leave; })[0];
      var last = dated[dated.length - 1];
      if (during) (place.after[during.id] = place.after[during.id] || []).push(w);
      else if (next) (place.before[next.id] = place.before[next.id] || []).push(w);
      else if (last) (place.after[last.id] = place.after[last.id] || []).push(w);
      else place.loose.push(w);
    });
    return place;
  }

  function awayBand(w) {
    var n = awayNights(w);
    return '<button class="away-band" type="button" data-away="' + esc(w.id) + '" aria-label="Edit away dates">' +
      '<span class="t">✈ Away for work</span>' +
      '<span class="d">' + esc(fmt(w.leave) + " → " + fmt(w.back) + " · " + plural(n, "night")) + "</span>" +
      (w.from ? '<span class="n">Flying from ' + esc(w.from) + "</span>" : "") +
      (w.notes ? '<span class="n">' + esc(w.notes) + "</span>" : "") +
      "</button>";
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
    var away = isAway(s);
    var badges = [];
    if (away) badges.push('<span class="badge away">On my own</span>');
    if (s.site) badges.push('<span class="badge">' + esc(s.site) + "</span>");
    badges.push(badge("Booked", s.booked));
    badges.push(badge("Dog", s.dog));
    if (s.km !== "" && s.km != null) badges.push('<span class="badge">' + km(num(s.km)) + "</span>");
    if (s.cost !== "" && s.cost != null) badges.push('<span class="badge">' + money(num(s.cost)) + "</span>");
    var links = [];
    var m = mapUrl(s);
    if (m) links.push('<a href="' + esc(m) + '" target="_blank" rel="noopener">Map</a>');
    if (s.web) links.push('<a href="' + esc(s.web) + '" target="_blank" rel="noopener">' + webLabel(s.web) + "</a>");
    return '<div class="card" style="border-left-color:' + (away ? "var(--away-line)" : legColour(s.leg)) + '">' +
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
      el.innerHTML = awaySorted().map(awayBand).join("") +
        '<div class="empty"><strong>No stops yet</strong>Tap “+ Add stop” to put in your first stop. Pick its leg, dates and where you’re staying.</div>';
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
    // Away bands show in the full list; the filtered lists keep just the purple stops
    var bands = filter === "all" ? placeAway(list) : { before: {}, after: {}, loose: [] };
    function withBands(s) {
      return (bands.before[s.id] || []).map(awayBand).join("") + stopCard(s) + (bands.after[s.id] || []).map(awayBand).join("");
    }

    el.innerHTML = bands.loose.map(awayBand).join("") + groups.filter(function (g) { return g.stops.length; }).map(function (g) {
      var all = trip.stops.filter(function (s) { return (s.leg || "") === g.n; });
      var t = totals(all);
      var title = g.n ? "Leg " + g.n + " · " + legName(g.n) : "No leg chosen";
      var meta = [];
      if (t.first) meta.push(fmt(t.first) + " – " + fmt(t.last || t.first));
      meta.push(plural(t.nights, "night"));
      if (t.km) meta.push(km(t.km));
      if (t.cost) meta.push(money(t.cost));
      var awayN = awayNightsIn(all);
      var routes = routeLinks(all);
      var hasPlace = all.some(function (s) { return s.location.trim(); });
      var routeHtml = (g.n && hasPlace) || routes.length ? '<div class="route-links">' +
        (g.n && hasPlace ? '<button class="map-btn" type="button" data-map="' + g.n + '">Show map</button>' : "") +
        routeLinkHtml(routes) + "</div>" : "";
      return '<div class="leg"><div class="leg-head"><span class="dot" style="background:' + legColour(g.n) + '"></span><div>' +
        "<h2>" + esc(title) + '</h2><div class="meta">' + esc(meta.join(" · ")) +
        (awayN ? ' · <span class="away-n">Away ' + plural(awayN, "night") + "</span>" : "") + "</div>" + routeHtml + "</div></div>" +
        g.stops.map(withBands).join("") + "</div>";
    }).join("");
  }

  $("stops").addEventListener("click", function (e) {
    var m = e.target.closest("[data-map]"); if (m) { openMap(+m.dataset.map); return; }
    var w = e.target.closest("[data-away]"); if (w) { openAway(w.dataset.away); return; }
    var c = e.target.closest(".card-main"); if (c) openEditor(c.dataset.id);
  });
  $("whole-map").addEventListener("click", function () { openMap("all"); });

  function routeLinkHtml(routes) {
    return routes.map(function (u, i) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + (routes.length > 1 ? "Google Maps route, part " + (i + 1) : "Google Maps route") + "</a>";
    }).join("");
  }

  // ---------- maps ----------
  // Map pictures come from OpenStreetMap; places are looked up once with OpenStreetMap's
  // free search (one at a time, as its rules ask) and remembered on the stop.
  var LEG_HEX = ["#9cc3e0", "#a9cf8c", "#e8b07c", "#c3a3df", "#e3cc5a", "#86cfc4", "#e59bb1", "#a9a9e6", "#b8cc8a", "#d9ad8f"];
  var mapDlg = $("map-dlg");
  var leaflet = null, pins = null, mapJob = 0, mapStops = [], mapMarkers = {};
  var lookups = {}; // this session's searches, so one town is only looked up once

  function geoQuery(s) { return s.location.trim(); }
  function needsGeo(s) { var q = geoQuery(s); return !!q && (!s.geo || s.geo.q !== q); }

  function search(q, australiaOnly) {
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en-AU" +
      (australiaOnly ? "&countrycodes=au" : "") + "&q=" + encodeURIComponent(q);
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("search " + r.status); return r.json(); });
  }
  function geocode(q) {
    if (lookups[q]) return Promise.resolve(lookups[q]);
    return search(q, true).then(function (a) {
      if (a && a[0]) return a;
      return new Promise(function (ok) { setTimeout(ok, 1100); }).then(function () { return search(q, false); });
    }).then(function (a) {
      var g = a && a[0] ? { q: q, lat: +a[0].lat, lng: +a[0].lon } : { q: q, none: true };
      lookups[q] = g;
      return g;
    });
  }

  function pinHtml(n, colour) { return '<div class="pin" style="background:' + colour + '">' + n + "</div>"; }
  function stopColour(s, legN) { var n = legN === "all" ? s.leg : legN; return LEG_HEX[n - 1] || "#d0d6d1"; }

  function setMapStatus(text) { var el = $("map-status"); el.textContent = text || ""; el.hidden = !text; }

  function drawMap(legN, fit) {
    if (!leaflet) return;
    pins.clearLayers(); mapMarkers = {};
    var pts = [];
    mapStops.forEach(function (s, i) {
      if (!s.geo || s.geo.none) return;
      var ll = [s.geo.lat, s.geo.lng];
      pts.push(ll);
      var n = nights(s);
      var pop = "<strong>" + esc(i + 1 + ". " + s.location) + "</strong>" +
        (s.arrive || s.depart ? esc((fmt(s.arrive) || "?") + " → " + (fmt(s.depart) || "?") + (n != null && n >= 0 ? " · " + plural(n, "night") : "")) + "<br>" : "") +
        (s.stay ? esc(s.stay) : "");
      mapMarkers[s.id] = L.marker(ll, {
        icon: L.divIcon({ className: "", html: pinHtml(i + 1, stopColour(s, legN)), iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] }),
        title: s.location
      }).bindPopup(pop).addTo(pins);
    });
    if (pts.length > 1) L.polyline(pts, { color: "#2f6b5a", weight: 3, opacity: 0.8, dashArray: "6 8" }).addTo(pins);
    if (fit) {
      if (pts.length > 1) leaflet.fitBounds(pts, { padding: [36, 36], maxZoom: 11 });
      else if (pts.length === 1) leaflet.setView(pts[0], 10);
      else leaflet.setView([-28, 134], 4); // Australia
    }
    var missing = mapStops.filter(function (s) { return s.geo && s.geo.none; }).map(function (s) { return s.location; });
    $("map-missing").hidden = !missing.length;
    $("map-missing").textContent = missing.length ? "Couldn't find on the map: " + missing.join(", ") + ". Check the spelling, or add the state (for example “Burrum Heads QLD”)." : "";
    document.querySelectorAll("#map-list li").forEach(function (li) {
      var s = mapStops[+li.dataset.i];
      li.classList.toggle("off", !(s.geo && !s.geo.none));
    });
  }

  function renderMapList(legN) {
    $("map-list").innerHTML = mapStops.map(function (s, i) {
      var n = nights(s);
      var dt = s.arrive ? fmt(s.arrive) + (n != null && n >= 0 ? " · " + plural(n, "night") : "") : "";
      return '<li data-i="' + i + '"><button type="button" data-stop="' + esc(s.id) + '">' + pinHtml(i + 1, stopColour(s, legN)) +
        '<span class="nm">' + esc(s.location) + '</span><span class="dt">' + esc(dt) + "</span></button></li>";
    }).join("");
  }
  $("map-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-stop]"); if (!b) return;
    var m = mapMarkers[b.dataset.stop];
    if (m) { leaflet.setView(m.getLatLng(), Math.max(leaflet.getZoom(), 10)); m.openPopup(); }
    else toast("That place isn't on the map yet.");
  });

  function openMap(legN) {
    var job = ++mapJob;
    mapStops = trip.stops.filter(function (s) { return (legN === "all" || s.leg === legN) && s.location.trim(); }).sort(byDate);
    var t = totals(mapStops);
    $("map-title").textContent = legN === "all" ? trip.name : "Leg " + legN + " · " + legName(legN);
    $("map-sub").textContent = plural(mapStops.length, "stop") + (t.first ? " · " + fmt(t.first) + " – " + fmt(t.last || t.first) : "") + (t.km ? " · " + km(t.km) : "");
    $("map-routes").innerHTML = legN === "all" ? "" : routeLinkHtml(routeLinks(mapStops));
    renderMapList(legN);
    mapDlg.showModal();

    if (!window.L) { setMapStatus("The map couldn't load. Check you have signal and try again."); return; }
    if (!leaflet) {
      leaflet = L.map("map", { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(leaflet);
      pins = L.layerGroup().addTo(leaflet);
    }
    setTimeout(function () { if (job !== mapJob) return; leaflet.invalidateSize(); drawMap(legN, true); }, 60);

    var todo = mapStops.filter(needsGeo);
    if (!todo.length) { setMapStatus(navigator.onLine === false ? "No signal: the map pictures need internet." : ""); return; }
    if (navigator.onLine === false) { setMapStatus("No signal: places will be found when you're back online."); return; }

    var done = 0, found = false;
    setMapStatus("Finding places on the map… 0 of " + todo.length);
    (function next() {
      if (job !== mapJob || !mapDlg.open) return;
      if (!todo.length) {
        setMapStatus("");
        if (found) persist();
        drawMap(legN, true);
        return;
      }
      var s = todo.shift(), q = geoQuery(s), cached = !!lookups[q];
      geocode(q).then(function (g) {
        trip.stops.forEach(function (x) { if (geoQuery(x) === q) x.geo = g; });
        found = true; done++;
        if (job !== mapJob) return;
        setMapStatus("Finding places on the map… " + done + " of " + (done + todo.length));
        drawMap(legN, false);
        setTimeout(next, cached ? 0 : 1100);
      }).catch(function () {
        if (job !== mapJob) return;
        if (found) persist();
        setMapStatus("Couldn't reach the map search. Try again when you have signal.");
        drawMap(legN, true);
      });
    })();
  }

  function closeMap() { mapJob++; mapDlg.close(); }
  $("map-close").addEventListener("click", closeMap);
  mapDlg.addEventListener("cancel", function () { mapJob++; });
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
      var legStops = trip.stops.filter(function (s) { return s.leg === l.n; });
      var t = totals(legStops), awayN = awayNightsIn(legStops);
      var tot = t.stops
        ? plural(t.stops, "stop") + " · " + plural(t.nights, "night") + (t.first ? " · " + fmt(t.first) + " – " + fmt(t.last || t.first) : "") + (t.km ? " · " + km(t.km) : "") + (t.cost ? " · " + money(t.cost) : "")
        : "No stops yet";
      return '<div class="leg-row">' +
        '<span class="leg-num" style="background:' + legColour(l.n) + '">' + l.n + "</span>" +
        '<input type="text" id="leg-name-' + l.n + '" data-leg="' + l.n + '" data-f="name" value="' + esc(l.name) + '" placeholder="Leg ' + l.n + ' title" aria-label="Leg ' + l.n + ' title">' +
        '<input class="route" type="text" id="leg-route-' + l.n + '" data-leg="' + l.n + '" data-f="route" value="' + esc(l.route) + '" placeholder="Route (optional)" aria-label="Leg ' + l.n + ' route">' +
        '<div class="totals">' + esc(tot) + (awayN ? ' · <span class="away-n">Away ' + plural(awayN, "night") + "</span>" : "") + "</div></div>";
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
      web: cleanUrl($("f-web").value), map: cleanUrl($("f-map").value),
      geo: null
    };
    var before = editing && trip.stops.filter(function (x) { return x.id === editing; })[0];
    if (before && before.geo && before.geo.q === s.location) s.geo = before.geo;
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

  // ---------- away editor ----------
  var awayDlg = $("away-dlg");
  var awayEditing = null, awayDeleteArmed = false;

  function updateAwayNote() {
    var a = ms($("a-leave").value), b = ms($("a-back").value), el = $("a-nights");
    var n = isNaN(a) || isNaN(b) ? null : Math.round((b - a) / DAY);
    el.className = "nights-note" + (n != null && n <= 0 ? " bad" : "");
    el.textContent = n == null ? "" : n <= 0 ? "The back date needs to be after the leave date." : "Away " + plural(n, "night");
  }
  $("a-leave").addEventListener("input", updateAwayNote);
  $("a-back").addEventListener("input", updateAwayNote);

  function openAway(id) {
    var w = id ? trip.away.filter(function (x) { return x.id === id; })[0] : null;
    w = w || { id: "", leave: "", back: "", from: "", notes: "" };
    awayEditing = w.id || null;
    $("away-title").textContent = awayEditing ? "Away for work" : "New away dates";
    $("a-leave").value = w.leave; $("a-back").value = w.back;
    $("a-from").value = w.from; $("a-notes").value = w.notes;
    $("delete-away").hidden = !awayEditing;
    awayDeleteArmed = false; $("delete-away").textContent = "Delete these away dates";
    updateAwayNote();
    awayDlg.showModal();
  }

  $("away-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var w = { id: awayEditing || uid(), leave: $("a-leave").value, back: $("a-back").value, from: $("a-from").value.trim(), notes: $("a-notes").value.trim() };
    if (!w.leave || !w.back) { toast("Add both the leave date and the back date"); return; }
    if (w.back <= w.leave) { toast("The back date needs to be after the leave date"); return; }
    if (awayEditing) trip.away = trip.away.map(function (x) { return x.id === awayEditing ? w : x; });
    else trip.away.push(w);
    save(); awayDlg.close(); renderAll();
    toast(awayEditing ? "Away dates saved" : "Away dates added");
  });
  $("away-close").addEventListener("click", function () { awayDlg.close(); });
  $("away-cancel").addEventListener("click", function () { awayDlg.close(); });
  $("delete-away").addEventListener("click", function () {
    var b = $("delete-away");
    if (!awayDeleteArmed) { awayDeleteArmed = true; b.textContent = "Tap again to delete"; setTimeout(function () { awayDeleteArmed = false; b.textContent = "Delete these away dates"; }, 3000); return; }
    trip.away = trip.away.filter(function (x) { return x.id !== awayEditing; });
    save(); awayDlg.close(); renderAll(); toast("Away dates deleted");
  });
  $("add-away").addEventListener("click", function () { openAway(null); });

  // ---------- backup ----------
  function stamp() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function backupBlob() {
    var copy = { app: "Trip Planner", version: 2, savedAt: new Date().toISOString(), current: store.current, trips: store.trips };
    return new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" });
  }
  function markBackedUp() {
    store.lastBackup = new Date().toISOString(); store.changedSinceBackup = false;
    persist();
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
        var incoming;
        if (data && Array.isArray(data.trips)) incoming = normaliseStore(data).trips;
        else if (data && Array.isArray(data.stops) && Array.isArray(data.legs)) {
          var single = normaliseTrip(data); single.id = uid(); single.name = data.name || "Restored trip";
          incoming = [single];
        } else throw new Error("bad");
        // Trips in the backup replace the same trips here; any others are added. Nothing else is removed.
        incoming.forEach(function (t) {
          var i = store.trips.map(function (x) { return x.id; }).indexOf(t.id);
          if (i >= 0) store.trips[i] = t; else store.trips.push(t);
        });
        store.current = incoming[0].id;
        trip = currentTrip();
        persist();
        show("stops");
        toast(incoming.length === 1 ? "Restored “" + trip.name + "”" : "Restored " + incoming.length + " trips");
      } catch (err) { toast("That file isn't a Trip Planner backup."); }
      e.target.value = "";
    };
    r.readAsText(f);
  });

  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  $("save-csv").addEventListener("click", function () {
    var rows = [["Leg #", "Leg", "Arrive", "Depart", "Nights", "Location", "Where we're staying", "Site type", "Dog OK?", "Booked?", "Cost (AUD)", "Drive (km)", "Notes", "Website", "Map", "On my own?"]];
    trip.stops.slice().sort(byDate).forEach(function (s) {
      var n = nights(s);
      rows.push([s.leg, s.leg ? legName(s.leg) : "", s.arrive, s.depart, n == null ? "" : n, s.location, s.stay, s.site, s.dog, s.booked, s.cost, s.km, s.notes, s.web, mapUrl(s), isAway(s) ? "Away" : ""]);
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    var slug = trip.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip";
    download(new Blob([csv], { type: "text/csv" }), slug + "-" + stamp() + ".csv");
    toast("Spreadsheet saved to your Downloads");
  });

  function renderBackup() {
    $("last-backup").textContent = store.lastBackup
      ? "Last backup: " + new Date(store.lastBackup).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "You haven't saved a backup yet.";
    var anyStops = store.trips.some(function (t) { return t.stops.length; });
    var stale = anyStops && store.changedSinceBackup && (!store.lastBackup || Date.now() - Date.parse(store.lastBackup) > 7 * DAY);
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

  // ---------- trips ----------
  var tripsDlg = $("trips-dlg");
  var tripDeleteArmed = false;

  function switchTrip(id) {
    store.current = id; trip = currentTrip(); persist();
    show("stops");
  }

  function renderTrips() {
    $("trip-list").innerHTML = store.trips.map(function (t) {
      var tt = totals(t.stops);
      var line = t.stops.length
        ? (tt.first ? fmt(tt.first, true) + " – " + fmt(tt.last || tt.first, true) + " · " : "") + plural(t.stops.length, "stop") + " · " + plural(tt.nights, "night")
        : "No stops yet";
      var on = t.id === trip.id;
      return '<button class="trip-item' + (on ? " on" : "") + '" type="button" data-trip="' + esc(t.id) + '"' + (on ? ' aria-current="true"' : "") + ">" +
        '<span class="trip-item-name">' + esc(t.name) + (on ? ' <span class="badge">Open</span>' : "") + "</span>" +
        '<span class="trip-item-meta">' + esc(line) + "</span></button>";
    }).join("");
    $("trip-rename").value = trip.name;
    $("trip-delete").hidden = store.trips.length < 2;
    tripDeleteArmed = false; $("trip-delete").textContent = "Delete this trip";
  }

  function openTrips() { renderTrips(); tripsDlg.showModal(); }
  $("open-trips").addEventListener("click", openTrips);
  $("trips-close").addEventListener("click", function () { tripsDlg.close(); });

  $("trip-list").addEventListener("click", function (e) {
    var b = e.target.closest("[data-trip]"); if (!b) return;
    tripsDlg.close();
    if (b.dataset.trip !== trip.id) { switchTrip(b.dataset.trip); toast("Opened “" + trip.name + "”"); }
  });

  $("trip-rename").addEventListener("input", function (e) {
    trip.name = e.target.value.trim() || "My trip";
    save(); renderHeader();
    var item = document.querySelector('.trip-item[data-trip="' + trip.id + '"] .trip-item-name');
    if (item) item.firstChild.textContent = trip.name + " ";
  });

  $("trip-new").addEventListener("click", function () {
    var t = freshTrip("New trip " + (store.trips.length + 1), []);
    store.trips.push(t); store.current = t.id; trip = t; save();
    renderTrips(); renderAll();
    var input = $("trip-rename"); input.focus(); input.select();
    toast("New trip made. Type its name above.");
  });

  $("trip-copy").addEventListener("click", function () {
    var t = JSON.parse(JSON.stringify(trip));
    t.id = uid(); t.name = trip.name + " (copy)";
    t.stops.forEach(function (s) { s.id = uid(); });
    store.trips.push(t); store.current = t.id; trip = t; save();
    renderTrips(); renderAll();
    var input = $("trip-rename"); input.focus(); input.select();
    toast("Copy made. Rename it above.");
  });

  $("trip-delete").addEventListener("click", function () {
    var b = $("trip-delete");
    if (store.trips.length < 2) return;
    if (!tripDeleteArmed) {
      tripDeleteArmed = true; b.textContent = "Tap again to delete “" + trip.name + "”";
      setTimeout(function () { tripDeleteArmed = false; b.textContent = "Delete this trip"; }, 3000);
      return;
    }
    var gone = trip.name;
    store.trips = store.trips.filter(function (t) { return t.id !== trip.id; });
    store.current = store.trips[0].id; trip = currentTrip(); save();
    tripsDlg.close(); show("stops"); toast("Deleted “" + gone + "”");
  });

  function renderHeader() { $("trip-name").textContent = trip.name; document.title = trip.name + " · Trip Planner"; }

  function renderAll() {
    renderHeader(); renderSummary(); renderStops(); renderBackup();
    $("whole-map").hidden = !trip.stops.some(function (s) { return s.location.trim(); });
  }

  renderAll();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // When a new version takes over, reload once so it shows straight away (nothing typed is lost: every change is already saved)
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController || reloaded) return;
      if (dlg.open || tripsDlg.open || awayDlg.open) return; // don't reload under someone typing; it shows next time
      reloaded = true; location.reload();
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) { reg.update(); }).catch(function () {});
    });
  }
})();
