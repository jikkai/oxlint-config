export const className = "itms-center";
export const ALIGN_CLASSES = { start: "itms-start" };

export function dynamicClass(color: string) {
  const classes = `bg-${color}-500`;
  return classes;
}
