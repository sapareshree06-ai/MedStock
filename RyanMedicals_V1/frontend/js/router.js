import { state } from "./state.js";
import { $ } from "./utils/dom.js";
import { loadData } from "./api/data.js";
import { post } from "./api/client.js";
import { toast } from "./components/toast.js";
import { pages } from "./pages/index.js";

// Context handed to every page's bind(): lets pages talk to the app
// without importing the router (which would create circular imports).
const ctx = {
  // Re-fetch data and re-render the current page.
  refresh: refreshCurrent,

  // POST a payload, show a toast, then refresh.
  async submit(path, payload, successMessage) {
    try {
      await post(path, payload);
      toast(successMessage);
      await refreshCurrent();
    } catch (err) {
      toast(err.message, true);
    }
  },
};

export function navigate(page) {
  const view = pages[page];
  if (!view) return;

  state.page = page;
  $("pageContent").innerHTML = view.render();
  $("pageCrumb").textContent = view.title;

  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));

  $("sidebar").classList.remove("open");
  $("mobileMenu")?.setAttribute("aria-expanded", "false");

  view.bind?.(ctx);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export async function refreshCurrent() {
  try {
    await loadData();
    navigate(state.page);
  } catch (err) {
    toast("Could not refresh data: " + err.message, true);
  }
}

// One delegated listener handles every [data-go] button on any page.
export function initRouter() {
  $("pageContent").addEventListener("click", (e) => {
    const target = e.target.closest("[data-go]");
    if (target) navigate(target.dataset.go);
  });

  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.addEventListener("click", () => navigate(b.dataset.page)));

  document.querySelector(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    navigate("overview");
  });
}
