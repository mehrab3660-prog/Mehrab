import Link from "next/link";

const BENEFITS = [
  { icon: "🚚", label: "ارسال سریع" },
  { icon: "🛡️", label: "ضمانت اصالت کالا" },
  { icon: "🔒", label: "پرداخت امن" },
  { icon: "↻", label: "۷ روز ضمانت بازگشت" },
];

export default function ShowroomSection() {
  return (
    <div className="mt-6 sm:mt-10">
      <div
        className="relative overflow-hidden rounded-2xl border border-border-color bg-cover bg-center"
        style={{ backgroundImage: "linear-gradient(90deg, rgba(3,7,10,.94) 0%, rgba(3,7,10,.25) 45%, rgba(3,7,10,.75) 100%), url('/images/showroom/hero-house.jpg')" }}
      >
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="text-center sm:text-right">
            <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              روشنایی <span className="text-brand">زندگی شما</span>
            </h1>
            <p className="mt-3 text-sm text-white/80 sm:text-base">فروشگاه تخصصی تجهیزات روشنایی با بهترین کیفیت و قیمت</p>
            <Link
              href="/products"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-extrabold text-[#0b0e14] shadow-lg shadow-brand/20"
            >
              مشاهده محصولات ←
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-56 sm:shrink-0 sm:flex-col">
            {BENEFITS.map((b) => (
              <div key={b.label} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-sm">
                <span aria-hidden="true">{b.icon}</span>
                <span className="text-xs font-bold text-white">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
