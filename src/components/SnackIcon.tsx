// One line icon per product type (the Category column in sku_master). Same drawings as design/icons.
const ICONS: Record<string, React.ReactNode> = {
  Beverage: (<><path d="M9 2h6v3l1.5 2.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V7.5L9 5V2z" /><path d="M7.5 12h9" /></>),
  Snack: (<><circle cx="12" cy="12" r="9" /><circle cx="9" cy="9" r=".7" fill="currentColor" /><circle cx="14.5" cy="8.5" r=".7" fill="currentColor" /><circle cx="15" cy="14" r=".7" fill="currentColor" /><circle cx="9.5" cy="15" r=".7" fill="currentColor" /><circle cx="12" cy="12" r=".7" fill="currentColor" /></>),
  Staple: (<><path d="M8 3h8l-1 3 3 3v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9l3-3-1-3z" /><path d="M9 6h6" /><path d="M12 11v7M12 13.5l-2-1.5M12 13.5l2-1.5M12 16.5l-2-1.5M12 16.5l2-1.5" /></>),
  "Dairy Alt": (<><path d="M6 9l2-6h8l2 6v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z" /><path d="M6 9h12" /><path d="M12 13c-1.2 1.6-2 2.6-2 3.6a2 2 0 0 0 4 0c0-1-.8-2-2-3.6z" /></>),
  Condiment: (<><path d="M8 3h8v3H8z" /><path d="M7 6h10a1 1 0 0 1 1 1v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a1 1 0 0 1 1-1z" /><path d="M9 12h6v4H9z" /></>),
};

export const CATEGORIES = Object.keys(ICONS);

export default function SnackIcon({ category, size = 28 }: { category: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="snack-icon">
      {ICONS[category] ?? ICONS.Staple}
    </svg>
  );
}
