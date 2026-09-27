import { PRODUCT_ICONS } from "./icons";
import { useI18n } from "../i18n";

const PRODUCT_ORDER = ["sst", "chla", "swh", "mwdir"];

export default function Sidebar({ products, activeProduct, onSelect }) {
  const { t } = useI18n();
  return (
    <nav className="product-list" aria-label={t("sidebar.layers")}>
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
              <span className="product-btn-label">{t(`product.${key}`)}</span>
              <span className="product-btn-meta">
                {p.timestamps.length} {t(p.timestamps.length === 1 ? "sidebar.image.one" : "sidebar.image.many")}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
