import { PRODUCT_ICONS } from "./icons";

const PRODUCT_ORDER = ["sst", "chla", "swh", "mwdir"];

export default function Sidebar({ products, activeProduct, onSelect }) {
  return (
    <nav className="product-list" aria-label="Wybór warstwy danych">
      {PRODUCT_ORDER.filter((key) => products[key]).map((key) => {
        const p = products[key];
        const isActive = key === activeProduct;
        const Icon = PRODUCT_ICONS[key];
        return (
          <button
            key={key}
            className={`product-btn${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(key)}
            aria-pressed={isActive}
          >
            {Icon && (
              <span className="product-btn-icon">
                <Icon />
              </span>
            )}
            <span className="product-btn-text">
              <span className="product-btn-label">{p.label}</span>
              <span className="product-btn-meta">
                {p.timestamps.length} {p.timestamps.length === 1 ? "zdjęcie" : "zdjęć"}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
