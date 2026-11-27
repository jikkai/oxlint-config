export const className = "items-center";
export const ALIGN_CLASSES = { start: "items-start" };

export function dynamicClass(isError: boolean) {
  const classes = isError ? "bg-red-500" : "bg-blue-500";
  return classes;
}
