interface UserAvatarProps {
  name?: string | null;
  className?: string;
}

export function UserAvatar({ name, className }: UserAvatarProps) {
  const initial = name?.[0]?.toUpperCase() ?? "?";

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-black text-white text-sm font-medium ${className}`}
      style={{ width: "36px", height: "36px" }}
    >
      {initial}
    </div>
  );
}
