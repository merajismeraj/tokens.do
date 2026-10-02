interface Props {
  user: { name: string | null; handle: string | null; image: string | null };
}

/** Avatar + name + @handle, each linking to the user's X profile. */
export function ProfileLink({ user }: Props) {
  const label = user.name ?? user.handle ?? "anon";
  const avatar = user.image ? (
    <img src={user.image} alt={`@${user.handle ?? label}`} className="avatar" loading="lazy" />
  ) : (
    <span className="avatar initial">{label[0]?.toUpperCase()}</span>
  );
  if (!user.handle) {
    return (
      <span className="who">
        {avatar}
        <span className="name">{label}</span>
      </span>
    );
  }
  const href = `https://x.com/${user.handle}`;
  return (
    <span className="who">
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`@${user.handle} on X`}>
        {avatar}
      </a>
      <span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="name">
          {label}
        </a>
        <a href={href} target="_blank" rel="noopener noreferrer" className="handle">
          @{user.handle} ↗
        </a>
      </span>
    </span>
  );
}
