import { useEffect } from "react";

let observedValue = false;

function useValue(value: boolean) {
  useEffect(() => {
    observedValue = value;
  }, []);
  return observedValue;
}

export function Fixture({ enabled }: { enabled: boolean }) {
  if (enabled) useValue(enabled);
  return null;
}
