export default function PlayerLink({ id, name }: { id: string; name: string }) {
  if (id === "0") return <>{name}</>;
  return <a className="plink" href={`#/player/${encodeURIComponent(id)}`}>{name}</a>;
}
