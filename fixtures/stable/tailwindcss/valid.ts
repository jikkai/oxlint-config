export const className = "items-center";

export function dynamicClass(isError: boolean) {
  const classes = isError ? "bg-red-500" : "bg-blue-500";
  return classes;
}
