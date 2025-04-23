export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
