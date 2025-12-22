(function () {
  // Highlight menu item theo trang hiện tại
  const path = (location.pathname || "").toLowerCase();
  const pageKey = (() => {
    if (path.includes("/pages/intro")) return "intro";
    if (path.includes("/pages/target")) return "target";
    if (path.includes("/pages/binary")) return "binary";
    if (path.includes("/pages/stack")) return "stack";
    if (path.includes("/pages/payload")) return "payload";
    if (path.includes("/pages/run")) return "run";
    if (path.includes("/pages/defense")) return "defense";
    return null;
  })();

  document.querySelectorAll(".navlink").forEach(a => {
    const k = a.getAttribute("data-page");
    if (k && k === pageKey) a.classList.add("active");
  });

  // Các mô phỏng an toàn: chỉ hiển thị chuỗi minh họa, không tạo payload thực
  window.DemoSim = {
    buildPayload: function (outId) {
      const el = document.getElementById(outId);
      if (!el) return;
      el.textContent =
        "Payload (mô phỏng): [padding] + [địa chỉ hàm mục tiêu]\n" +
        "Ghi chú: Đây là minh họa khái niệm, không phải dữ liệu khai thác thực.";
    },
    runNormal: function (outId) {
      const el = document.getElementById(outId);
      if (!el) return;
      el.textContent = "Kết quả (mô phỏng): Chương trình kết thúc bình thường.";
    },
    runRedirected: function (outId) {
      const el = document.getElementById(outId);
      if (!el) return;
      el.textContent =
        "Kết quả (mô phỏng): Luồng thực thi bị điều hướng tới hàm mục tiêu.\n" +
        "SUCCESS (mô phỏng): Bạn đã hiểu cơ chế ghi đè địa chỉ trả về.";
    }
  };
})();
