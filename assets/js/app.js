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
    if (path.includes("/pages/simulator")) return "sim";
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

// =====================
// Advanced Simulator (safe conceptual)
// =====================
(function(){
  function nowTime(){
    return new Date().toLocaleTimeString();
  }
  function log(el, msg){
    el.textContent = `[${nowTime()}] ${msg}\n` + el.textContent;
  }

  // Conceptual memory layout:
  // 64 buffer cells + 4 canary + 4 saved frame + 4 return
  const LAYOUT = { buffer:64, canary:4, saved:4, ret:4 };

  function buildCells(){
    const cells = [];
    for (let i=0;i<LAYOUT.buffer;i++) cells.push({ kind:"data", label:"B" });
    for (let i=0;i<LAYOUT.canary;i++) cells.push({ kind:"guard", label:"C", safe:true });
    for (let i=0;i<LAYOUT.saved;i++)  cells.push({ kind:"meta", label:"S" });
    for (let i=0;i<LAYOUT.ret;i++)    cells.push({ kind:"control", label:"R" });
    return cells;
  }

  function resetMarks(state){
    state.cells.forEach(c => { c.hit=false; c.corrupt=false; c.safe=(c.kind==="guard"); });
  }

  function applyASLRLabels(state, aslrOn){
    // Pure visualization label only; no addresses.
    const retStart = LAYOUT.buffer + LAYOUT.canary + LAYOUT.saved;
    for (let i=0;i<LAYOUT.ret;i++){
      state.cells[retStart+i].label = aslrOn ? "R*" : "R";
    }
  }

  function renderGrid(gridEl, state){
    gridEl.innerHTML = "";
    state.cells.forEach((c, idx) => {
      const d = document.createElement("div");
      d.className =
        `cell2 ${c.kind}` +
        (c.hit ? " hit" : "") +
        (c.corrupt ? " corrupt" : "") +
        (c.safe ? " safe" : "");
      d.title = `#${idx} - ${c.kind}`;
      d.textContent = c.label;
      gridEl.appendChild(d);
    });
  }

  function renderTimeline(timelineEl, state){
    timelineEl.innerHTML = "";
    state.steps.forEach((s, i) => {
      const d = document.createElement("div");
      d.className = "tstep" +
        (i === state.stepIndex ? " active" : "") +
        (i < state.stepIndex ? " done" : "");
      d.textContent = s.title;
      timelineEl.appendChild(d);
    });
  }

  function makeState(){
    return {
      cells: buildCells(),
      // timeline steps
      steps: [
        { key:"call",     title:"CALL vulnerable_function" },
        { key:"prologue", title:"Prologue (setup stack frame)" },
        { key:"copy",     title:"Copy input → buffer" },
        { key:"canary",   title:"Canary check" },
        { key:"epilogue", title:"Epilogue (restore frame)" },
        { key:"ret",      title:"RET (return to caller)" },
      ],
      stepIndex: 0,
      // copy simulation
      inputLen: 0,
      wrote: 0,
      copyMode: "safe", // safe|unsafe
      canaryOn: true,
      aslrOn: true,
      // derived state
      canaryIntact: true,
      controlTouched: false,
      aborted: false,
      // animation
      animTimer: null,
      writeCursor: 0
    };
  }

  function setHint(hintEl, msg){
    hintEl.textContent = msg || "";
  }

  // Copy simulation:
  // - safe: writes at most buffer size
  // - unsafe: writes input length and can overflow into adjacent regions (conceptual)
  function prepareCopy(state){
    resetMarks(state);
    state.wrote = 0;
    state.writeCursor = 0;
    state.controlTouched = false;
    state.canaryIntact = true;

    const total = state.cells.length;
    const canaryStart = LAYOUT.buffer;
    const retStart = LAYOUT.buffer + LAYOUT.canary + LAYOUT.saved;

    const willWrite = (state.copyMode === "safe")
      ? Math.min(state.inputLen, LAYOUT.buffer)
      : Math.min(state.inputLen, total);

    // Precompute: if unsafe and passes canary region, canary would be corrupted.
    if (state.copyMode === "unsafe" && state.canaryOn && state.inputLen > canaryStart){
      state.canaryIntact = false;
    }

    // If unsafe and reaches return region, mark conceptual "control touched"
    if (state.copyMode === "unsafe" && state.inputLen > retStart){
      state.controlTouched = true;
    }

    return { willWrite, canaryStart, retStart, total };
  }

  function stopAnim(state){
    if (state.animTimer){
      clearInterval(state.animTimer);
      state.animTimer = null;
    }
  }

  function runCopyAnimated(opts){
    const { state, gridEl, logEl, hintEl, speedMs } = opts;
    stopAnim(state);

    const meta = prepareCopy(state);
    const { willWrite, canaryStart, retStart } = meta;

    if (state.copyMode === "safe"){
      log(logEl, `Safe copy: sẽ ghi tối đa ${LAYOUT.buffer} ô buffer. Input=${state.inputLen} → ghi=${willWrite}.`);
      setHint(hintEl, "Safe copy: ghi bị giới hạn trong buffer → không tràn (mô phỏng).");
    } else {
      log(logEl, `Unsafe copy: sẽ ghi theo input (có thể tràn). Input=${state.inputLen} → ghi=${willWrite}.`);
      setHint(hintEl, "Unsafe copy: có thể ghi vượt buffer → tràn sang vùng lân cận (mô phỏng).");
    }

    // animate writing cell by cell
    state.animTimer = setInterval(() => {
      if (state.writeCursor >= willWrite){
        stopAnim(state);
        state.wrote = willWrite;

        // mark canary safe/corrupt visual
        for (let i=0;i<LAYOUT.canary;i++){
          const cell = state.cells[canaryStart+i];
          if (state.canaryOn){
            cell.safe = state.canaryIntact;
            if (!state.canaryIntact) cell.corrupt = true;
          } else {
            cell.safe = false; // not used
          }
        }

        if (state.copyMode === "unsafe" && state.inputLen > canaryStart){
          log(logEl, state.canaryOn
            ? "Canary region đã bị chạm → canary sẽ fail khi check (mô phỏng)."
            : "Canary OFF → không có cơ chế chặn ở bước canary check (mô phỏng)."
          );
        }

        if (state.copyMode === "unsafe" && state.inputLen > retStart){
          log(logEl, "Vùng return address (control) đã bị chạm theo khái niệm.");
        }

        renderGrid(gridEl, state);
        return;
      }

      const i = state.writeCursor;
      state.cells[i].hit = true;

      // if writing beyond buffer in unsafe mode => conceptual corruption
      if (state.copyMode === "unsafe" && i >= LAYOUT.buffer){
        state.cells[i].corrupt = true;
      }

      state.writeCursor++;
      renderGrid(gridEl, state);
    }, speedMs);
  }

  function canaryCheck(state, logEl, hintEl){
    if (!state.canaryOn){
      log(logEl, "Canary OFF: bỏ qua kiểm tra canary (mô phỏng).");
      setHint(hintEl, "Canary OFF: không chặn được hành vi ghi tràn bằng canary (mô phỏng).");
      return { ok:true };
    }
    if (!state.canaryIntact){
      log(logEl, "Canary FAIL: phát hiện bất thường → dừng trước khi RET (mô phỏng).");
      setHint(hintEl, "Canary FAIL: chương trình bị chặn trước khi return (mô phỏng).");
      state.aborted = true;
      return { ok:false };
    }
    log(logEl, "Canary PASS: không phát hiện bất thường (mô phỏng).");
    setHint(hintEl, "Canary PASS: tiếp tục sang epilogue/ret (mô phỏng).");
    return { ok:true };
  }

  function doReturn(state, logEl, hintEl){
    if (state.aborted){
      log(logEl, "Đã bị dừng trước đó → không thực hiện RET (mô phỏng).");
      setHint(hintEl, "Luồng dừng vì canary fail (mô phỏng).");
      return;
    }
    if (state.controlTouched && state.copyMode === "unsafe"){
      log(logEl, "RET: (khái niệm) dữ liệu điều khiển có thể bị ảnh hưởng → luồng có thể bị điều hướng (mô phỏng).");
      setHint(hintEl, "RET (mô phỏng): control data bị chạm → nguy cơ điều hướng luồng.");
    } else {
      log(logEl, "RET: return bình thường (mô phỏng).");
      setHint(hintEl, "RET bình thường (mô phỏng).");
    }
  }

  function stepOnce(ctx){
    const { state, gridEl, logEl, timelineEl, hintEl } = ctx;

    // If aborted, still allow stepping but indicate stopped
    const step = state.steps[state.stepIndex];
    if (!step){
      log(logEl, "Đã ở cuối timeline.");
      return;
    }

    // Keep labels for ASLR
    applyASLRLabels(state, state.aslrOn);

    renderTimeline(timelineEl, state);

    if (step.key === "call"){
      log(logEl, "CALL: chuyển điều khiển sang vulnerable_function (mô phỏng).");
      setHint(hintEl, "CALL: vào hàm có thể có lỗi copy (mô phỏng).");
      state.stepIndex++;
      renderTimeline(timelineEl, state);
      return;
    }

    if (step.key === "prologue"){
      log(logEl, "Prologue: tạo stack frame (mô phỏng).");
      setHint(hintEl, "Prologue: bố trí vùng buffer/canary/saved/return (mô phỏng).");
      // mark regions as initial safe
      resetMarks(state);
      // show canary safe if enabled
      const canaryStart = LAYOUT.buffer;
      for (let i=0;i<LAYOUT.canary;i++){
        state.cells[canaryStart+i].safe = state.canaryOn;
      }
      renderGrid(gridEl, state);

      state.stepIndex++;
      renderTimeline(timelineEl, state);
      return;
    }

    if (step.key === "copy"){
      if (state.aborted){
        log(logEl, "Đã bị dừng (aborted) → bỏ qua copy.");
        state.stepIndex++;
        renderTimeline(timelineEl, state);
        return;
      }
      runCopyAnimated({
        state, gridEl, logEl, hintEl,
        speedMs: ctx.speedMs
      });
      // Copy runs animated; we advance timeline after animation finishes by polling
      const poll = setInterval(() => {
        if (!state.animTimer){
          clearInterval(poll);
          state.stepIndex++;
          renderTimeline(timelineEl, state);
        }
      }, 30);
      return;
    }

    if (step.key === "canary"){
      canaryCheck(state, logEl, hintEl);
      state.stepIndex++;
      renderTimeline(timelineEl, state);
      // If fail, we still allow epilogue/ret steps but they’ll show stopped
      return;
    }

    if (step.key === "epilogue"){
      if (state.aborted){
        log(logEl, "Epilogue: không chạy vì chương trình đã dừng (mô phỏng).");
        setHint(hintEl, "Không qua epilogue vì đã bị chặn (mô phỏng).");
      } else {
        log(logEl, "Epilogue: khôi phục stack frame (mô phỏng).");
        setHint(hintEl, "Epilogue: chuẩn bị RET (mô phỏng).");
      }
      state.stepIndex++;
      renderTimeline(timelineEl, state);
      return;
    }

    if (step.key === "ret"){
      doReturn(state, logEl, hintEl);
      state.stepIndex++;
      renderTimeline(timelineEl, state);
      return;
    }
  }

  function resetAll(ctx){
    const { state, gridEl, logEl, timelineEl, hintEl } = ctx;
    stopAnim(state);

    state.cells = buildCells();
    state.stepIndex = 0;
    state.wrote = 0;
    state.writeCursor = 0;
    state.canaryIntact = true;
    state.controlTouched = false;
    state.aborted = false;

    applyASLRLabels(state, state.aslrOn);
    resetMarks(state);
    renderGrid(gridEl, state);
    renderTimeline(timelineEl, state);
    setHint(hintEl, "");
    log(logEl, "Reset: quay về trạng thái ban đầu.");
  }

  function runAuto(ctx){
    const { state, logEl } = ctx;
    if (state.animTimer){
      log(logEl, "Đang chạy copy animation → vui lòng đợi xong hoặc Reset.");
      return;
    }
    // run until end
    const loop = () => {
      if (state.animTimer) return; // wait
      if (state.stepIndex >= state.steps.length) return;
      stepOnce(ctx);
      // schedule next tick, but let animations finish
      setTimeout(loop, 120);
    };
    loop();
  }

  window.DemoSim = window.DemoSim || {};
  window.DemoSim.AdvSim = {
    init: function(opts){
      const gridEl = document.getElementById(opts.gridId);
      const logEl  = document.getElementById(opts.logId);
      const timelineEl = document.getElementById(opts.timelineId);
      const hintEl = document.getElementById(opts.memHintId);

      const inLen  = document.getElementById(opts.inLenId);
      const inVal  = document.getElementById(opts.inValId);

      const speed = document.getElementById(opts.speedId);
      const speedVal = document.getElementById(opts.speedValId);

      const canary = document.getElementById(opts.canaryId);
      const aslr   = document.getElementById(opts.aslrId);

      const btnStep  = document.getElementById(opts.btnStepId);
      const btnAuto  = document.getElementById(opts.btnAutoId);
      const btnReset = document.getElementById(opts.btnResetId);

      if (!gridEl || !logEl || !timelineEl || !hintEl || !inLen || !inVal || !speed || !speedVal || !canary || !aslr || !btnStep || !btnAuto || !btnReset) {
        return;
      }

      const state = makeState();

      function getCopyMode(){
        const radios = document.querySelectorAll(`input[name='${opts.copyModeName}']`);
        for (const r of radios) if (r.checked) return r.value;
        return "safe";
      }

      function syncUItoState(){
        state.inputLen = Number(inLen.value);
        state.copyMode = getCopyMode();
        state.canaryOn = canary.checked;
        state.aslrOn = aslr.checked;
      }

      function syncRanges(){
        inVal.textContent = String(inLen.value);
        speedVal.textContent = String(speed.value);
      }

      syncRanges();
      syncUItoState();
      applyASLRLabels(state, state.aslrOn);
      renderGrid(gridEl, state);
      renderTimeline(timelineEl, state);
      log(logEl, "Khởi tạo Advanced Simulator.");

      inLen.addEventListener("input", () => {
        syncRanges();
        syncUItoState();
      });

      speed.addEventListener("input", () => {
        syncRanges();
      });

      canary.addEventListener("change", () => {
        syncUItoState();
        log(logEl, canary.checked ? "Canary ON (mô phỏng)." : "Canary OFF (mô phỏng).");
      });

      aslr.addEventListener("change", () => {
        syncUItoState();
        applyASLRLabels(state, state.aslrOn);
        renderGrid(gridEl, state);
        log(logEl, aslr.checked ? "ASLR/PIE ON: nhãn return đổi (R*)." : "ASLR/PIE OFF: nhãn return cố định (R).");
      });

      document.querySelectorAll(`input[name='${opts.copyModeName}']`).forEach(r => {
        r.addEventListener("change", () => {
          syncUItoState();
          log(logEl, state.copyMode === "safe" ? "Chọn Safe copy." : "Chọn Unsafe copy.");
        });
      });

      btnStep.addEventListener("click", () => {
        if (state.animTimer) return; // avoid stepping during animation
        syncUItoState();
        const speedMs = Number(speed.value);
        stepOnce({ state, gridEl, logEl, timelineEl, hintEl, speedMs });
      });

      btnAuto.addEventListener("click", () => {
        if (state.animTimer) return;
        syncUItoState();
        const speedMs = Number(speed.value);
        runAuto({ state, gridEl, logEl, timelineEl, hintEl, speedMs });
      });

      btnReset.addEventListener("click", () => {
        syncUItoState();
        resetAll({ state, gridEl, logEl, timelineEl, hintEl });
      });
    }
  };
})();
