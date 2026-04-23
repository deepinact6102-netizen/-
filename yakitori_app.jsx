import { useState } from "react";

const MENU_ITEMS = [
  { id: 1, name: "Negima", description: "Chicken thigh and green onion", price: 2.5 },
  { id: 2, name: "Tsukune", description: "Chicken meatball with tare sauce", price: 2.75 },
  { id: 3, name: "Momo", description: "Juicy chicken thigh", price: 2.25 },
  { id: 4, name: "Kawa", description: "Crispy chicken skin", price: 2.0 },
  { id: 5, name: "Tebasaki", description: "Chicken wing", price: 2.5 },
  { id: 6, name: "Shishito", description: "Grilled shishito peppers", price: 1.75 },
  { id: 7, name: "Enoki Bacon", description: "Bacon-wrapped enoki mushrooms", price: 3.0 },
  { id: 8, name: "Asparagus Bacon", description: "Bacon-wrapped asparagus", price: 3.0 },
];

function CartItem({ item, quantity, onIncrease, onDecrease }) {
  return (
    <div style={styles.cartItem}>
      <span style={styles.cartItemName}>{item.name}</span>
      <div style={styles.cartItemControls}>
        <button style={styles.qtyBtn} onClick={onDecrease}>−</button>
        <span style={styles.qty}>{quantity}</span>
        <button style={styles.qtyBtn} onClick={onIncrease}>+</button>
      </div>
      <span style={styles.cartItemPrice}>
        ${(item.price * quantity).toFixed(2)}
      </span>
    </div>
  );
}

function MenuItem({ item, quantity, onAdd }) {
  return (
    <div style={styles.menuItem}>
      <div style={styles.menuItemInfo}>
        <h3 style={styles.menuItemName}>{item.name}</h3>
        <p style={styles.menuItemDesc}>{item.description}</p>
        <span style={styles.menuItemPrice}>${item.price.toFixed(2)} / skewer</span>
      </div>
      <button style={styles.addBtn} onClick={() => onAdd(item)}>
        {quantity > 0 ? `Add more (${quantity})` : "Add"}
      </button>
    </div>
  );
}

export default function YakitoriApp() {
  const [cart, setCart] = useState({});
  const [orderPlaced, setOrderPlaced] = useState(false);

  const addToCart = (item) => {
    setCart((prev) => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };

  const changeQty = (id, delta) => {
    setCart((prev) => {
      const next = (prev[id] || 0) + delta;
      if (next <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const cartItems = MENU_ITEMS.filter((item) => cart[item.id]);
  const total = cartItems.reduce((sum, item) => sum + item.price * cart[item.id], 0);
  const skewersInCart = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleOrder = () => {
    setOrderPlaced(true);
    setCart({});
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>焼き鳥 Yakitori Grill</h1>
        <p style={styles.subtitle}>Charcoal-grilled skewers, made to order</p>
      </header>

      {orderPlaced && (
        <div style={styles.banner}>
          Order placed! Your skewers are on the grill.{" "}
          <button style={styles.bannerBtn} onClick={() => setOrderPlaced(false)}>
            Order again
          </button>
        </div>
      )}

      <div style={styles.layout}>
        <section style={styles.menu}>
          <h2 style={styles.sectionTitle}>Menu</h2>
          {MENU_ITEMS.map((item) => (
            <MenuItem
              key={item.id}
              item={item}
              quantity={cart[item.id] || 0}
              onAdd={addToCart}
            />
          ))}
        </section>

        <aside style={styles.sidebar}>
          <h2 style={styles.sectionTitle}>
            Your Order {skewersInCart > 0 && `(${skewersInCart})`}
          </h2>
          {cartItems.length === 0 ? (
            <p style={styles.emptyCart}>No skewers added yet.</p>
          ) : (
            <>
              {cartItems.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  quantity={cart[item.id]}
                  onIncrease={() => changeQty(item.id, 1)}
                  onDecrease={() => changeQty(item.id, -1)}
                />
              ))}
              <div style={styles.totalRow}>
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <button style={styles.orderBtn} onClick={handleOrder}>
                Place Order
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

const styles = {
  app: {
    fontFamily: "'Segoe UI', sans-serif",
    minHeight: "100vh",
    backgroundColor: "#1a1a1a",
    color: "#f0e6d3",
  },
  header: {
    backgroundColor: "#2d1a0e",
    padding: "2rem",
    textAlign: "center",
    borderBottom: "2px solid #8b4513",
  },
  title: { margin: 0, fontSize: "2rem", color: "#f5a623" },
  subtitle: { margin: "0.5rem 0 0", color: "#c9a07a", fontSize: "1rem" },
  banner: {
    backgroundColor: "#2a5c2a",
    color: "#90ee90",
    padding: "0.75rem 1.5rem",
    textAlign: "center",
  },
  bannerBtn: {
    marginLeft: "1rem",
    background: "none",
    border: "1px solid #90ee90",
    color: "#90ee90",
    cursor: "pointer",
    padding: "0.2rem 0.6rem",
    borderRadius: "4px",
  },
  layout: {
    display: "flex",
    gap: "2rem",
    padding: "2rem",
    maxWidth: "1100px",
    margin: "0 auto",
    alignItems: "flex-start",
  },
  menu: { flex: 1 },
  sidebar: {
    width: "300px",
    backgroundColor: "#2d2011",
    borderRadius: "8px",
    padding: "1.5rem",
    position: "sticky",
    top: "1rem",
  },
  sectionTitle: {
    color: "#f5a623",
    borderBottom: "1px solid #8b4513",
    paddingBottom: "0.5rem",
    marginTop: 0,
  },
  menuItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2d2011",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    marginBottom: "0.75rem",
  },
  menuItemInfo: { flex: 1 },
  menuItemName: { margin: "0 0 0.25rem", fontSize: "1.05rem" },
  menuItemDesc: { margin: "0 0 0.25rem", color: "#c9a07a", fontSize: "0.85rem" },
  menuItemPrice: { color: "#f5a623", fontSize: "0.9rem" },
  addBtn: {
    marginLeft: "1rem",
    backgroundColor: "#8b4513",
    color: "#f0e6d3",
    border: "none",
    borderRadius: "6px",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cartItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.6rem",
    gap: "0.5rem",
  },
  cartItemName: { flex: 1, fontSize: "0.95rem" },
  cartItemControls: { display: "flex", alignItems: "center", gap: "0.4rem" },
  qtyBtn: {
    backgroundColor: "#8b4513",
    color: "#f0e6d3",
    border: "none",
    borderRadius: "4px",
    width: "24px",
    height: "24px",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: 1,
  },
  qty: { minWidth: "20px", textAlign: "center" },
  cartItemPrice: { color: "#f5a623", minWidth: "48px", textAlign: "right" },
  emptyCart: { color: "#c9a07a", fontSize: "0.9rem" },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontWeight: "bold",
    borderTop: "1px solid #8b4513",
    paddingTop: "0.75rem",
    marginTop: "0.75rem",
    color: "#f5a623",
  },
  orderBtn: {
    width: "100%",
    marginTop: "1rem",
    padding: "0.75rem",
    backgroundColor: "#f5a623",
    color: "#1a1a1a",
    border: "none",
    borderRadius: "6px",
    fontSize: "1rem",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
