function useValue() {
  return 1;
}

export function Fixture() {
  useValue();
  return null;
}
