export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border-color bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-foreground/60">
        <p className="font-bold text-foreground">فروشگاه سلطان نور</p>
        <p className="mt-1">فروشگاه آنلاین B2C و B2B با پشتیبانی از قیمت‌گذاری پلکانی برای مشتریان عمده.</p>
        <p className="mt-4">© {new Date().getFullYear()} تمامی حقوق محفوظ است.</p>
      </div>
    </footer>
  );
}
