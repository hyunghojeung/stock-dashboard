"use client";

import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "작업리스트", color: "bg-blue-600 hover:bg-blue-700" },
    { href: "/dashboard/write", label: "작업등록", color: "bg-blue-600 hover:bg-blue-700" },
    { href: "/dashboard/orders", label: "발주서", color: "bg-gray-700 hover:bg-gray-800" },
    { href: "/dashboard/memo", label: "작업메모", color: "bg-emerald-600 hover:bg-emerald-700" },
  ];

  return (
    <div className="bg-white px-4 md:px-6 py-2 border-b border-gray-200 flex justify-end gap-2 overflow-x-auto">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className={`px-4 py-2 rounded text-white text-xs md:text-sm font-medium whitespace-nowrap transition ${
            pathname === link.href ? link.color + " ring-2 ring-offset-1 ring-blue-300" : link.color
          }`}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
