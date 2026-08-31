function useValue() {
  return 1;
}

export function Fixture() {
  const value = useValue();
  return <span>{value}</span>;
}
