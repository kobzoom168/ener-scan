function getValueByPrefix(text, prefix) {
  const line = String(text || "")
    .split("\n")
    .find((l) => l.trim().startsWith(prefix));

  if (!line) return "-";
  return line.replace(prefix, "").trim() || "-";
}

export function parseScanResultForHistory(resultText) {
  return {
    energyScore: getValueByPrefix(resultText, "ระดับพลัง:").replace("/ 10", "").trim(),
    mainEnergy: getValueByPrefix(resultText, "พลังหลัก:"),
    compatibility: getValueByPrefix(resultText, "ความสอดคล้องกับเจ้าของ:"),
  };
}