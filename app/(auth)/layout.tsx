export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-white">英超大亂鬥</h1>
          <p className="text-slate-400 text-sm mt-1">Premier League 2026/27</p>
        </div>
        {children}
      </div>
    </div>
  );
}
