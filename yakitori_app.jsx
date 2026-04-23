import { useState, useRef, useCallback, useEffect } from "react";

const ITEMS = [
  { name: "ねぎま", daily: 30, spare: 5, course: true },
  { name: "むね", daily: 10, spare: 0, course: false },
  { name: "ぼんじり", daily: 30, spare: 5, course: false },
  { name: "せせり", daily: 15, spare: 5, course: false },
  { name: "ハツ", daily: 30, spare: 5, course: true },
  { name: "レバー", daily: 10, spare: 0, course: false, fixed: true },
  { name: "とり皮", daily: 15, spare: 0, course: false },
  { name: "砂肝", daily: 15, spare: 0, course: false },
  { name: "ささみ", daily: 30, spare: 5, course: true },
];

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];

function getInitialState() {
  const days = {};
  DAYS.forEach((d) => {
    days[d] = { date: "", remain: {}, delivery: {}, confirmed: {}, multiDay: "", course: "" };
    ITEMS.forEach((item) => {
      days[d].remain[item.name] = "";
      days[d].delivery[item.name] = "";
      days[d].confirmed[item.name] = "";
    });
  });
  return days;
}

// Check if a day is a "no delivery" day (previous day had multiDay >= 2)
function isNoDeliveryDay(dayIndex, daysData) {
  if (dayIndex <= 0 || dayIndex > 6) return false;
  const prevDay = DAYS[dayIndex - 1];
  const prevMulti = parseFloat(daysData[prevDay].multiDay);
  return prevMulti >= 2;
}

function getEffectiveDelivery(itemName, dayIndex, daysData) {
  // If this is a no-delivery day, return "0"
  if (isNoDeliveryDay(dayIndex, daysData)) return "0";

  const day = DAYS[dayIndex];
  const manual = daysData[day].delivery[itemName];
  if (manual !== "") return manual;
  const fromIndex = dayIndex - 2;
  if (fromIndex >= 0 && fromIndex <= 6) {
    const fromDay = DAYS[fromIndex];
    const val = daysData[fromDay].confirmed[itemName];
    if (val !== "") return val;
  }
  return "";
}

function getEffectiveConfirmed(itemName, dayIndex, daysData) {
  if (isNoDeliveryDay(dayIndex, daysData)) return "0";
  return daysData[DAYS[dayIndex]].confirmed[itemName];
}

function calcOrder(item, dayIndex, daysData) {
  const day = DAYS[dayIndex];
  const d = daysData[day];
  if (item.fixed) { return 10 * (parseFloat(d.multiDay) || 1); }
  if (dayIndex >= 6) return "";

  const remain = parseFloat(d.remain[item.name]);
  const nextDayDelivery = parseFloat(getEffectiveDelivery(item.name, dayIndex + 1, daysData));

  if (isNaN(remain) || isNaN(nextDayDelivery)) return "";

  const base = Math.max(remain + nextDayDelivery - item.daily + item.daily + item.spare, 0);
  const multi = parseFloat(d.multiDay) || 1;
  const courseNum = item.course ? parseFloat(d.course) || 0 : 0;
  return Math.ceil(base * multi + courseNum);
}

function getDeliveryDateStr(dateStr, multiDay) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const m = parseFloat(multiDay) || 1;
  const d1 = new Date(d); d1.setDate(d1.getDate() + 2);
  const fmt = (dt) => `${dt.getMonth()+1}/${dt.getDate()}`;
  if (m <= 1) return `${fmt(d1)}納品`;
  const d2 = new Date(d); d2.setDate(d2.getDate() + 1 + m);
  return `${fmt(d1)}~${fmt(d2)}納品`;
}

const STORAGE_KEY = "yakitori-order-data-v5";

export default function YakitoriApp() {
  const [daysData, setDaysData] = useState(getInitialState());
  const [loading, setLoading] = useState(false);
  const [storageLoading, setStorageLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(null);
  const [toast, setToast] = useState("");
  const [lastSaved, setLastSaved] = useState(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          if (parsed.daysData) {
            const d = parsed.daysData;
            DAYS.forEach(day => {
              if (!d[day].confirmed) { d[day].confirmed = {}; ITEMS.forEach(i => d[day].confirmed[i.name] = ""); }
              if (!d[day].delivery) { d[day].delivery = {}; ITEMS.forEach(i => d[day].delivery[i.name] = ""); }
            });
            setDaysData(d);
          }
          if (parsed.savedAt) setLastSaved(parsed.savedAt);
        }
      } catch (e) { console.log("No saved data:", e); }
      finally { setStorageLoading(false); }
    };
    loadData();
  }, []);

  const saveData = useCallback(async (data) => {
    try {
      const now = new Date().toLocaleString("ja-JP");
      await window.storage.set(STORAGE_KEY, JSON.stringify({ daysData: data, savedAt: now }));
      setLastSaved(now);
    } catch (e) { console.error("Save failed:", e); }
  }, []);

  useEffect(() => {
    if (storageLoading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveData(daysData); }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [daysData, saveData, storageLoading]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const updateField = useCallback((day, field, itemName, value) => {
    setDaysData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (itemName) { next[day][field][itemName] = value; } else { next[day][field] = value; }
      return next;
    });
  }, []);

  const handlePhoto = (day) => { setActiveDay(day); fileRef.current?.click(); };
  const handleReset = async () => {
    if (!confirm("データをすべてリセットしますか？")) return;
    setDaysData(getInitialState());
    try { await window.storage.delete(STORAGE_KEY); } catch (e) {}
    setLastSaved(null); showToast("データをリセットしました");
  };
  const handleManualSave = async () => { await saveData(daysData); showToast("保存しました"); };

  const copyCalcToConfirmed = () => {
    if (!activeDay) return;
    const di = DAYS.indexOf(activeDay);
    setDaysData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      ITEMS.forEach((item) => {
        const order = calcOrder(item, di, next);
        if (order !== "" && typeof order === "number") {
          next[activeDay].confirmed[item.name] = String(order);
        }
      });
      return next;
    });
    showToast("計算予定数を確定発注数にコピーしました");
  };

  const processImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeDay) return;
    e.target.value = "";
    setLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("読み込み失敗"));
        r.readAsDataURL(file);
      });
      const mediaType = file.type || "image/jpeg";
      const itemNames = ITEMS.map((i) => i.name).join(", ");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: `この画像は焼き鳥屋の残数メモです。以下の品目の残数を読み取ってください。\n品目リスト: ${itemNames}\n\n重要ルール:\n- JSONのみを返してください。マークダウンのバッククォートや説明文は不要です。\n- 形式: {"ねぎま": 12, "むね": 5, ...}\n- 読み取れない品目はnullにしてください\n- 数字だけ正確に読み取ってください\n- 手書きの数字を注意深く読んでください` },
          ]}],
        }),
      });
      const data = await response.json();
      const text = data.content.map((i) => (i.type === "text" ? i.text : "")).filter(Boolean).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setDaysData((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        Object.entries(parsed).forEach(([name, val]) => {
          if (val !== null && next[activeDay].remain[name] !== undefined) next[activeDay].remain[name] = String(val);
        });
        return next;
      });
      showToast(`${Object.values(parsed).filter((v) => v !== null).length}品目の残数を読み取りました`);
    } catch (err) { console.error(err); showToast("読み取りに失敗しました"); }
    finally { setLoading(false); setActiveDay(null); }
  };

  if (storageLoading) {
    return (
      <div style={{ fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", background: "#f5f0eb", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>🍢</div>
        <div style={{ color: "#2d1810", fontWeight: 700, fontSize: 16 }}>読み込み中...</div>
      </div>
    );
  }

  const deliveryDateStr = activeDay ? getDeliveryDateStr(daysData[activeDay].date, daysData[activeDay].multiDay) : "";
  const dayIndex = activeDay ? DAYS.indexOf(activeDay) : -1;
  const noDelivery = activeDay ? isNoDeliveryDay(dayIndex, daysData) : false;

  return (
    <div style={{ fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif", background: "#f5f0eb", minHeight: "100vh", padding: "12px", maxWidth: 600, margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #2d1810 0%, #4a2c1a 100%)", borderRadius: 16, padding: "16px 20px", marginBottom: 16, textAlign: "center", boxShadow: "0 4px 20px rgba(45,24,16,0.3)" }}>
        <div style={{ fontSize: 12, color: "#d4a574", letterSpacing: 4, marginBottom: 4 }}>焼き鳥</div>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0, fontWeight: 800, letterSpacing: 2 }}>発注管理</h1>
        {lastSaved && <div style={{ fontSize: 10, color: "rgba(212,165,116,0.7)", marginTop: 6 }}>最終保存: {lastSaved}</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={handleManualSave} style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#2e7d32", color: "#fff" }}>💾 保存</button>
        <button onClick={handleReset} style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#e8e0d8", color: "#8a7a6a" }}>🔄 リセット</button>
      </div>

      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#2d1810", color: "#fff", padding: "10px 24px", borderRadius: 30, fontSize: 14, fontWeight: 600, zIndex: 1000, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>{toast}</div>}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={processImage} style={{ display: "none" }} />

      {loading && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, flexDirection: "column", gap: 16 }}>
          <div style={{ width: 48, height: 48, border: "4px solid rgba(255,255,255,0.2)", borderTop: "4px solid #d4a574", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>手書きメモを読み取り中...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {DAYS.map((day) => {
          const isActive = activeDay === day;
          const di = DAYS.indexOf(day);
          const hasData = Object.values(daysData[day].remain).some((v) => v !== "");
          const isNoDeliv = isNoDeliveryDay(di, daysData);
          return (
            <button key={day} onClick={() => setActiveDay(activeDay === day ? null : day)}
              style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer",
                background: isActive ? "#2d1810" : isNoDeliv ? "#ffcdd2" : hasData ? "#d4a574" : "#e8e0d8",
                color: isActive ? "#fff" : isNoDeliv ? "#c62828" : hasData ? "#2d1810" : "#8a7a6a",
                transition: "all 0.2s", position: "relative" }}>
              {day}
              {hasData && !isActive && <div style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: "#2d1810" }} />}
            </button>
          );
        })}
      </div>

      {activeDay && (
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 12 }}>
          <div style={{ background: "#2d1810", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "#d4a574", fontSize: 24, fontWeight: 900 }}>{activeDay}</span>
              <input type="date" value={daysData[activeDay].date} onChange={(e) => updateField(activeDay, "date", null, e.target.value)}
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14 }} />
            </div>
            <button onClick={() => handlePhoto(activeDay)}
              style={{ background: "linear-gradient(135deg, #d4a574, #c4935a)", border: "none", color: "#2d1810", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              📷 残数読取
            </button>
          </div>

          {noDelivery && (
            <div style={{ background: "#ffcdd2", padding: "8px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#c62828", borderBottom: "1px solid #eee" }}>
              ⚠️ 納品なし（前日が2日分発注のため）
            </div>
          )}

          {deliveryDateStr && !noDelivery && (
            <div style={{ background: "#FFF0F0", padding: "6px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#C00000", borderBottom: "1px solid #eee" }}>
              📦 {deliveryDateStr}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, padding: "10px 16px", background: "#faf7f4", borderBottom: "1px solid #eee" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#8a7a6a", fontWeight: 600, display: "block", marginBottom: 4 }}>発注日数</label>
              <input type="number" inputMode="numeric" placeholder="1"
                value={noDelivery ? "0" : daysData[activeDay].multiDay}
                disabled={noDelivery}
                onChange={(e) => updateField(activeDay, "multiDay", null, e.target.value)}
                style={{ width: "100%", padding: "8px", border: "2px solid #e8e0d8", borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: "center", color: noDelivery ? "#ccc" : "#9C27B0", boxSizing: "border-box", background: noDelivery ? "#f0f0f0" : "#fff" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#8a7a6a", fontWeight: 600, display: "block", marginBottom: 4 }}>コース人数</label>
              <input type="number" inputMode="numeric" placeholder="0" value={daysData[activeDay].course} onChange={(e) => updateField(activeDay, "course", null, e.target.value)}
                style={{ width: "100%", padding: "8px", border: "2px solid #e8e0d8", borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: "center", color: "#3F51B5", boxSizing: "border-box" }} />
            </div>
          </div>

          <div>
            <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr 1fr", padding: "8px 8px", background: "#f5f0eb", borderBottom: "2px solid #2d1810", fontSize: 10, fontWeight: 700, color: "#6a5a4a" }}>
              <div>品名</div>
              <div style={{ textAlign: "center", color: "#2e7d32" }}>残数</div>
              <div style={{ textAlign: "center", color: "#1565c0" }}>納品数</div>
              <div style={{ textAlign: "center", color: "#ED7D31" }}>計算予定</div>
              <div style={{ textAlign: "center", color: "#C00000" }}>確定発注</div>
            </div>
            {ITEMS.map((item, idx) => {
              const order = noDelivery ? "" : calcOrder(item, dayIndex, daysData);
              const manualDelivery = daysData[activeDay].delivery[item.name];
              const autoDelivery = (() => {
                if (noDelivery) return "0";
                const fromIndex = dayIndex - 2;
                if (fromIndex >= 0 && fromIndex <= 6) {
                  const val = daysData[DAYS[fromIndex]].confirmed[item.name];
                  if (val !== "") return val;
                }
                return "";
              })();
              const isAutoFilled = manualDelivery === "" && autoDelivery !== "";
              const displayDelivery = noDelivery ? "0" : (manualDelivery || autoDelivery);
              const confirmedVal = noDelivery ? "0" : daysData[activeDay].confirmed[item.name];

              return (
                <div key={item.name} style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr 1fr", padding: "5px 8px", alignItems: "center", borderBottom: "1px solid #f0ebe5", background: noDelivery ? "#fafafa" : (idx % 2 === 0 ? "#fff" : "#fdfbf9"), opacity: noDelivery ? 0.6 : 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#2d1810" }}>
                    {item.name}{item.course && <span style={{ fontSize: 7, color: "#3F51B5", marginLeft: 1 }}>●</span>}
                  </div>
                  <div style={{ padding: "0 2px" }}>
                    <input type="number" inputMode="numeric" value={daysData[activeDay].remain[item.name]} onChange={(e) => updateField(activeDay, "remain", item.name, e.target.value)}
                      style={{ width: "100%", padding: "7px 2px", border: "2px solid #c8e6c9", borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: "center", color: "#2e7d32", background: "#f1f8e9", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ padding: "0 2px" }}>
                    {noDelivery ? (
                      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#ccc", padding: "7px 2px" }}>0</div>
                    ) : (
                      <input type="number" inputMode="numeric"
                        value={manualDelivery}
                        placeholder={autoDelivery || ""}
                        onChange={(e) => updateField(activeDay, "delivery", item.name, e.target.value)}
                        style={{ width: "100%", padding: "7px 2px", border: isAutoFilled ? "2px dashed #90caf9" : "2px solid #bbdefb", borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: "center", color: isAutoFilled ? "#90caf9" : "#1565c0", background: "#e3f2fd", boxSizing: "border-box" }} />
                    )}
                  </div>
                  <div style={{ textAlign: "center", fontSize: 18, fontWeight: 900, color: order === "" ? "#ccc" : order > 0 ? "#ED7D31" : "#888", padding: "7px 2px", background: order !== "" && order > 0 ? "#FFF2CC" : "transparent", borderRadius: 8 }}>
                    {noDelivery ? "−" : (order === "" ? "−" : order)}
                  </div>
                  <div style={{ padding: "0 2px" }}>
                    {noDelivery ? (
                      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: "#ccc", padding: "7px 2px" }}>0</div>
                    ) : (
                      <input type="number" inputMode="numeric" value={daysData[activeDay].confirmed[item.name]} onChange={(e) => updateField(activeDay, "confirmed", item.name, e.target.value)}
                        style={{ width: "100%", padding: "7px 2px", border: "2px solid #ef9a9a", borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: "center", color: "#C00000", background: "#FFF0F0", boxSizing: "border-box" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!noDelivery && (
            <div style={{ padding: "8px 16px", background: "#faf7f4", borderTop: "1px solid #eee" }}>
              <button onClick={copyCalcToConfirmed}
                style={{ width: "100%", padding: "10px", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#C00000", color: "#fff" }}>
                📋 計算予定数 → 確定発注数にコピー
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr 1fr 1fr", padding: "10px 8px", background: "#2d1810", color: "#fff", fontWeight: 700, fontSize: 12 }}>
            <div>合計</div>
            <div style={{ textAlign: "center" }}>{ITEMS.reduce((s, i) => { const v = parseFloat(daysData[activeDay].remain[i.name]); return s + (isNaN(v) ? 0 : v); }, 0) || "−"}</div>
            <div style={{ textAlign: "center" }}>
              {noDelivery ? "0" : (ITEMS.reduce((s, i) => { const v = parseFloat(getEffectiveDelivery(i.name, dayIndex, daysData)); return s + (isNaN(v) ? 0 : v); }, 0) || "−")}
            </div>
            <div style={{ textAlign: "center", color: "#ED7D31", fontSize: 16 }}>
              {noDelivery ? "−" : (() => { let t = 0, h = false; ITEMS.forEach((i) => { const o = calcOrder(i, dayIndex, daysData); if (o !== "" && typeof o === "number") { t += o; h = true; } }); return h ? t : "−"; })()}
            </div>
            <div style={{ textAlign: "center", color: "#ef9a9a", fontSize: 16 }}>
              {noDelivery ? "0" : (ITEMS.reduce((s, i) => { const v = parseFloat(daysData[activeDay].confirmed[i.name]); return s + (isNaN(v) ? 0 : v); }, 0) || "−")}
            </div>
          </div>
        </div>
      )}

      {!activeDay && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", color: "#8a7a6a" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🍢</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "#2d1810" }}>曜日をタップして開始</div>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            📷「残数読取」で手書きメモを撮影<br />→ 計算予定数が自動算出<br />→ 確定発注数に入力<br />→ 2日後の納品数に自動反映
          </div>
          <div style={{ marginTop: 16, padding: "10px 16px", background: "#faf7f4", borderRadius: 10, fontSize: 12, color: "#a09080", lineHeight: 1.7 }}>
            <span style={{ color: "#2e7d32" }}>●</span> 残数 <span style={{ color: "#1565c0" }}>●</span> 納品数 <span style={{ color: "#ED7D31" }}>●</span> 計算予定 <span style={{ color: "#C00000" }}>●</span> 確定発注<br />
            <span style={{ color: "#3F51B5" }}>●</span> コース対象：ねぎま・ハツ・ささみ<br />
            <span style={{ color: "#c62828" }}>●</span> 2日分発注の翌日は納品なし(自動で0)
          </div>
          <div style={{ marginTop: 12, padding: "8px 16px", background: "#f0f0f0", borderRadius: 10, fontSize: 11, color: "#666", lineHeight: 1.6 }}>
            計算式：当日残数 ＋ 翌日納品数 − 翌日使用数 ＋ 翌々日使用数 ＋ 予備<br />
            確定発注 → 2日後の納品数に自動反映（手入力で上書き可）
          </div>
        </div>
      )}

      {!activeDay && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2d1810", marginBottom: 10 }}>週間サマリー</div>
          <div style={{ display: "flex", gap: 4 }}>
            {DAYS.map((day) => {
              const di = DAYS.indexOf(day);
              const isNoDeliv = isNoDeliveryDay(di, daysData);
              let t = 0, h = false;
              if (!isNoDeliv) {
                ITEMS.forEach((i) => { const o = calcOrder(i, di, daysData); if (o !== "" && typeof o === "number") { t += o; h = true; } });
              }
              return (
                <div key={day} style={{ flex: 1, textAlign: "center", padding: "8px 0", background: isNoDeliv ? "#ffcdd2" : h ? "#fff3e0" : "#f5f0eb", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: isNoDeliv ? "#c62828" : "#8a7a6a", fontWeight: 600 }}>{day}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: isNoDeliv ? "#c62828" : h ? "#c62828" : "#ccc", marginTop: 4 }}>
                    {isNoDeliv ? "休" : h ? t : "−"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
