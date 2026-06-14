export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark h-screen overflow-y-auto bg-slate-900 text-white">
      {children}
    </div>
  );
}
