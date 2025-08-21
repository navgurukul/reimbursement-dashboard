interface OrgLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function Layout({ children, params }: OrgLayoutProps) {
  const { slug } = await params;
  return <>{children}</>;
}
