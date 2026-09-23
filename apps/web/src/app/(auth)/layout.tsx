export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return <div className="flex min-h-svh flex-col items-center justify-center p-6">{children}</div>;
}
