export const fmtNum = (n: number) => n.toLocaleString("pt-BR");

/** 1500 -> "25h 00min" */
export const fmtMin = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
};

export const firstName = (name: string) => name.split(" ")[0];
