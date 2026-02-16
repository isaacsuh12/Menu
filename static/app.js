const API_BASE = "";
const tokenKey = "menuToken";

const menuGrid = document.getElementById("menuGrid");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const becomeMasterBtn = document.getElementById("becomeMasterBtn");
const authCard = document.getElementById("authCard");
const masterToolsLink = document.getElementById("masterToolsLink");
const logoutBtn = document.getElementById("logoutBtn");
const userEmail = document.getElementById("userEmail");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const closeModal = document.getElementById("closeModal");
const cartList = document.getElementById("cartList");
const cartTotal = document.getElementById("cartTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const orderNameInput = document.getElementById("orderName");
const adminPanel = document.getElementById("adminPanel");
const menuForm = document.getElementById("menuForm");
const clearMenuBtn = document.getElementById("clearMenuBtn");
const menuSubmitBtn = document.getElementById("menuSubmitBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const masterOrdersPanel = document.getElementById("masterOrders");
const ordersList = document.getElementById("ordersList");
const clearOrdersBtn = document.getElementById("clearOrdersBtn");
const masterUsersPanel = document.getElementById("masterUsers");
const usersList = document.getElementById("usersList");

let menuItems = [];
let cart = [];
let currentUser = null;
let editingItemId = null;
let ordersRefreshTimer = null;

function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setToken(token) {
  if (token) {
    localStorage.setItem(tokenKey, token);
  } else {
    localStorage.removeItem(tokenKey);
  }
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.detail || "Request failed";
    throw new Error(message);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function renderMenu() {
  menuGrid.innerHTML = "";
  menuItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "menu-card";
    card.style.animationDelay = `${index * 60}ms`;
    const masterControls = currentUser?.is_master
      ? `<div class="menu-card-actions">
          <button class="ghost" data-action="edit">Edit</button>
          <button class="ghost" data-action="delete">Delete</button>
        </div>`
      : "";
    card.innerHTML = `
      <div class="menu-card-top">
        <div>
          <h4>${item.name}</h4>
          <p>${item.description || ""}</p>
        </div>
        <span>${formatPrice(item.price_cents)}</span>
      </div>
      <div class="menu-card-bottom">
        <span class="chip">${item.category}</span>
        <div class="menu-card-actions">
          <button data-action="customize">Customize</button>
          ${masterControls}
        </div>
      </div>
    `;
    card.querySelector("[data-action=customize]").addEventListener("click", () =>
      openModal(item)
    );
    const editBtn = card.querySelector("[data-action=edit]");
    if (editBtn) {
      editBtn.addEventListener("click", () => startEdit(item));
    }
    const deleteBtn = card.querySelector("[data-action=delete]");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Delete ${item.name}?`)) {
          return;
        }
        try {
          await apiFetch(`/menu/${item.id}`, { method: "DELETE" });
          if (editingItemId === item.id) {
            resetEditState();
          }
          await loadMenu();
        } catch (error) {
          alert(error.message);
        }
      });
    }
    menuGrid.appendChild(card);
  });
}

function startEdit(item) {
  editingItemId = item.id;
  menuForm.name.value = item.name;
  menuForm.category.value = item.category;
  menuForm.price_cents.value = item.price_cents;
  menuForm.description.value = item.description || "";
  menuForm.options.value = item.options ? JSON.stringify(item.options, null, 2) : "";
  menuSubmitBtn.textContent = "Update Menu Item";
  cancelEditBtn.hidden = false;
  menuForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetEditState() {
  editingItemId = null;
  menuForm.reset();
  menuSubmitBtn.textContent = "Add to Menu";
  cancelEditBtn.hidden = true;
}

function openModal(item) {
  modalBody.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "modal-inner";
  wrapper.innerHTML = `
    <h3>${item.name}</h3>
    <p>${item.description || ""}</p>
    <div class="options"></div>
    <label class="field">
      Quantity
      <input type="number" min="1" value="1" />
    </label>
    <div class="modal-footer">
      <span class="price" id="modalPrice">${formatPrice(item.price_cents)}</span>
      <button id="addToCart">Add to order</button>
    </div>
  `;
  const optionsContainer = wrapper.querySelector(".options");
  const quantityInput = wrapper.querySelector("input[type=number]");
  const priceLabel = wrapper.querySelector("#modalPrice");

  const selectedOptions = {};
  if (item.options && item.options.length) {
    item.options.forEach((group) => {
      const label = document.createElement("label");
      label.className = "field";
      label.innerHTML = `${group.name}`;
      const select = document.createElement("select");
      if (!group.required) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No preference";
        select.appendChild(option);
      }
      group.choices.forEach((choice) => {
        const option = document.createElement("option");
        option.value = choice.label;
        option.textContent = `${choice.label}${choice.price_cents ? ` (+${formatPrice(choice.price_cents)})` : ""}`;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        if (select.value) {
          selectedOptions[group.name] = select.value;
        } else {
          delete selectedOptions[group.name];
        }
        updateModalPrice();
      });
      label.appendChild(select);
      optionsContainer.appendChild(label);
    });
  }

  function updateModalPrice() {
    let extras = 0;
    if (item.options) {
      item.options.forEach((group) => {
        const choiceLabel = selectedOptions[group.name];
        if (!choiceLabel) return;
        const choice = group.choices.find((c) => c.label === choiceLabel);
        if (choice) {
          extras += choice.price_cents || 0;
        }
      });
    }
    const quantity = Number(quantityInput.value) || 1;
    const total = (item.price_cents + extras) * quantity;
    priceLabel.textContent = formatPrice(total);
  }

  quantityInput.addEventListener("input", updateModalPrice);

  wrapper.querySelector("#addToCart").addEventListener("click", () => {
    const quantity = Number(quantityInput.value) || 1;
    cart.push({
      menu_item_id: item.id,
      name: item.name,
      quantity,
      selected_options: { ...selectedOptions },
      base_price_cents: item.price_cents,
      options: item.options || [],
    });
    renderCart();
    closeModalWindow();
  });

  modalBody.appendChild(wrapper);
  modal.hidden = false;
}

function closeModalWindow() {
  modal.hidden = true;
}

function renderCart() {
  cartList.innerHTML = "";
  let total = 0;
  cart.forEach((item, index) => {
    let extras = 0;
    const optionLines = [];
    if (item.selected_options && item.options) {
      item.options.forEach((group) => {
        const label = item.selected_options[group.name];
        if (!label) return;
        const choice = group.choices.find((c) => c.label === label);
        if (choice) {
          extras += choice.price_cents || 0;
          optionLines.push(`${group.name}: ${label}`);
        }
      });
    }
    const lineTotal = (item.base_price_cents + extras) * item.quantity;
    total += lineTotal;
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <p>${optionLines.join(" | ")}</p>
        <span>Qty ${item.quantity}</span>
      </div>
      <div class="cart-actions">
        <span>${formatPrice(lineTotal)}</span>
        <button data-index="${index}" class="ghost">Remove</button>
      </div>
    `;
    row.querySelector("button").addEventListener("click", () => {
      cart.splice(index, 1);
      renderCart();
    });
    cartList.appendChild(row);
  });
  cartTotal.textContent = `Total: ${formatPrice(total)}`;
}

async function loadMenu() {
  menuItems = await apiFetch("/menu");
  renderMenu();
}

function renderOrders(orders) {
  ordersList.innerHTML = "";
  if (!orders.length) {
    ordersList.innerHTML = "<p>No orders yet.</p>";
    return;
  }
  orders.forEach((order) => {
    const card = document.createElement("div");
    card.className = `order-card${order.served ? " served" : ""}`;
    const createdAt = new Date(order.created_at).toLocaleString();
    const items = order.items
      .map((item) => `• ${item.quantity}x ${item.name}`)
      .join("<br />");
    const servedButton = order.served
      ? "<span class=\"served-badge\">Served</span>"
      : `<button class=\"ghost\" data-action=\"served\" data-id=\"${order.id}\">Order served</button>`;
    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <strong>${order.name || "Order"}</strong>
          <span>${createdAt}</span>
        </div>
        <div class="order-card-actions">
          <span>${formatPrice(order.total_cents)}</span>
          ${servedButton}
        </div>
      </div>
      <div class="order-card-body">${items}</div>
    `;
    const serveBtn = card.querySelector("[data-action=served]");
    if (serveBtn) {
      serveBtn.addEventListener("click", async () => {
        try {
          await apiFetch(`/orders/${order.id}/served`, { method: "POST" });
          await loadOrders();
        } catch (error) {
          alert(error.message);
        }
      });
    }
    ordersList.appendChild(card);
  });
}

async function loadOrders() {
  if (!currentUser?.is_master) {
    return;
  }
  const orders = await apiFetch("/orders");
  renderOrders(orders);
}

function renderUsers(users) {
  usersList.innerHTML = "";
  if (!users.length) {
    usersList.innerHTML = "<p>No accounts yet.</p>";
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "order-card";
    row.innerHTML = `
      <div class="order-card-header">
        <div>
          <strong>${user.email}</strong>
          <span>${user.is_master ? "Master" : "User"}</span>
        </div>
        <div class="order-card-actions">
          <button class="ghost" data-action="delete" data-id="${user.id}">Delete</button>
        </div>
      </div>
    `;
    const deleteBtn = row.querySelector("[data-action=delete]");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Delete account for ${user.email}?`)) {
          return;
        }
        try {
          await apiFetch(`/admin/users/${user.id}`, { method: "DELETE" });
          await loadUsers();
        } catch (error) {
          alert(error.message);
        }
      });
    }
    usersList.appendChild(row);
  });
}

async function loadUsers() {
  if (!currentUser?.is_master) {
    return;
  }
  const users = await apiFetch("/admin/users");
  renderUsers(users);
}

function startOrdersRefresh() {
  if (ordersRefreshTimer) {
    return;
  }
  ordersRefreshTimer = setInterval(() => {
    if (currentUser?.is_master) {
      loadOrders();
    }
  }, 5000);
}

function stopOrdersRefresh() {
  if (ordersRefreshTimer) {
    clearInterval(ordersRefreshTimer);
    ordersRefreshTimer = null;
  }
}

async function refreshUser() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    userEmail.textContent = "Guest";
    logoutBtn.hidden = true;
    adminPanel.hidden = true;
    masterOrdersPanel.hidden = true;
    masterUsersPanel.hidden = true;
    authCard.hidden = false;
    masterToolsLink.hidden = true;
    stopOrdersRefresh();
    return;
  }
  try {
    currentUser = await apiFetch("/me");
    userEmail.textContent = currentUser.email;
    logoutBtn.hidden = false;
    adminPanel.hidden = !currentUser.is_master;
    masterOrdersPanel.hidden = !currentUser.is_master;
    masterUsersPanel.hidden = !currentUser.is_master;
    authCard.hidden = true;
    masterToolsLink.hidden = !currentUser.is_master;
    renderMenu();
    if (currentUser.is_master) {
      await loadOrders();
      await loadUsers();
      startOrdersRefresh();
    } else {
      stopOrdersRefresh();
    }
  } catch (error) {
    setToken(null);
    currentUser = null;
    userEmail.textContent = "Guest";
    logoutBtn.hidden = true;
    adminPanel.hidden = true;
    masterOrdersPanel.hidden = true;
    masterUsersPanel.hidden = true;
    authCard.hidden = false;
    masterToolsLink.hidden = true;
    stopOrdersRefresh();
    renderMenu();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const data = new URLSearchParams();
  data.append("username", formData.get("email"));
  data.append("password", formData.get("password"));
  try {
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: data,
    });
    setToken(result.access_token);
    await refreshUser();
  } catch (error) {
    alert(error.message);
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const email = formData.get("email");
  const password = formData.get("password");
  const payload = { email, password };
  try {
    await apiFetch("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = new URLSearchParams();
    data.append("username", email);
    data.append("password", password);
    const result = await apiFetch("/auth/login", {
      method: "POST",
      body: data,
    });
    setToken(result.access_token);
    await refreshUser();
    registerForm.reset();
  } catch (error) {
    alert(error.message);
  }
});

becomeMasterBtn.addEventListener("click", async () => {
  if (!getToken()) {
    alert("Please login before enabling master mode.");
    return;
  }
  try {
    await apiFetch("/auth/become-master", { method: "POST" });
    await refreshUser();
    alert("Master mode enabled.");
  } catch (error) {
    alert(error.message);
  }
});

logoutBtn.addEventListener("click", () => {
  setToken(null);
  refreshUser();
});

closeModal.addEventListener("click", closeModalWindow);
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeModalWindow();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) {
    closeModalWindow();
  }
});

placeOrderBtn.addEventListener("click", async () => {
  if (!cart.length) {
    alert("Cart is empty.");
    return;
  }
  if (!getToken()) {
    alert("Please login before placing an order.");
    return;
  }
  const orderName = orderNameInput.value.trim();
  if (!orderName) {
    alert("Please enter an order name.");
    return;
  }
  try {
    const items = cart.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      selected_options: item.selected_options,
    }));
    await apiFetch("/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orderName, items }),
    });
    cart = [];
    renderCart();
    orderNameInput.value = "";
    await loadOrders();
    alert("Order placed!");
  } catch (error) {
    alert(error.message);
  }
});

clearOrdersBtn.addEventListener("click", async () => {
  if (!confirm("Clear all orders? This cannot be undone.")) {
    return;
  }
  try {
    await apiFetch("/orders", { method: "DELETE" });
    await loadOrders();
  } catch (error) {
    alert(error.message);
  }
});

menuForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(menuForm);
  let options = null;
  const optionsRaw = formData.get("options");
  if (optionsRaw) {
    try {
      options = JSON.parse(optionsRaw);
    } catch (error) {
      alert("Options JSON is invalid.");
      return;
    }
  }
  const payload = {
    name: formData.get("name"),
    category: formData.get("category"),
    price_cents: Number(formData.get("price_cents")),
    description: formData.get("description"),
    options,
  };
  try {
    if (editingItemId) {
      await apiFetch(`/menu/${editingItemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await apiFetch("/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    resetEditState();
    await loadMenu();
  } catch (error) {
    alert(error.message);
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetEditState();
});

clearMenuBtn.addEventListener("click", async () => {
  if (!confirm("Clear all menu items? This cannot be undone.")) {
    return;
  }
  try {
    await apiFetch("/menu", { method: "DELETE" });
    await loadMenu();
  } catch (error) {
    alert(error.message);
  }
});

(async function init() {
  await refreshUser();
  await loadMenu();
  renderCart();
})();
