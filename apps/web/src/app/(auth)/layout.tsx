export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:px-6">
      {children}
    </div>
  );
}
