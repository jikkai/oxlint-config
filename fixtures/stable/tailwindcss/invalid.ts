export const className = "itms-center";

export function dynamicClass(color: string) {
  const classes = `bg-${color}-500`;
  return classes;
}
