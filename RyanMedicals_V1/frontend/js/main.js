// Application entry point. Loaded once from index.html as <script type="module">.
import { API } from "./config.js";
import { $, esc } from "./utils/dom.js";
import { todayLabel } from "./utils/format.js";
import { loadData } from "./api/data.js";
import { pageHeading } from "./components/layout.js";
import { initRouter, navigate } from "./router.js";
import { initTheme } from "./theme.js";

function showConnectionError(err) {
  $("pageContent").innerHTML =
    pageHeading(
      "CONNECTION",
      "Backend unavailable",
      "The frontend could not retrieve data from the Ryan Medicals API."
    ) +
    `<section class="panel"><div class="panel-body"><div class="notice"><strong>Could not connect to ${esc(
      API
    )}.</strong><br>Start your FastAPI server, confirm that it is running on port 8000, and refresh this page.<br><br>${esc(
      err.message
    )}</div><button class="btn btn-primary" id="retryButton">Retry connection</button></div></section>`;

  $("retryButton").addEventListener("click", loadAndShow);
}

async function loadAndShow() {
  try {
    await loadData();
    navigate("overview");
  } catch (err) {
    showConnectionError(err);
  }
}

function start() {
  initTheme();
  initRouter();

  $("todayLabel").textContent = todayLabel();
  $("mobileMenu").addEventListener("click", () => {
    const open = $("sidebar").classList.toggle("open");
    $("mobileMenu").setAttribute("aria-expanded", String(open));
  });

  loadAndShow();
}

start();
