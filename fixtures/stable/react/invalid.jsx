function useValue() {
  return 1;
}

export function Fixture({ enabled }) {
  if (enabled) useValue();
  return null;
}
