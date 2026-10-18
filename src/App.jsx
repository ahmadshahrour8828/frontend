import { useEffect, useRef, useState } from "react";
import "./App.css";

const DEFAULT_API_BASE = "http://api.dev.svc.cluster.local:80/api";
const STORAGE_KEY = "smart-education-api-base";

function getStoredApiBase() {
  let v = "/api";
  return v;
}

function summarizeValidationError(detail) {
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join(" ");
  }
  return String(detail);
}

let toastId = 0;

export default function App() {
  const [apiBase, setApiBaseState] = useState(getStoredApiBase());
  const [apiBaseInputValue, setApiBaseInputValue] = useState(getStoredApiBase());

  const [healthStatus, setHealthStatus] = useState({ state: "pending", text: "Health: checking…" });
  const [readyStatus, setReadyStatus] = useState({ state: "pending", text: "DB: checking…" });

  const [apiPod, setApiPod] = useState(null);
  const [apiPodError, setApiPodError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [allCourses, setAllCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [listMessage, setListMessage] = useState("Loading courses…");

  const [toasts, setToasts] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);

  const titleInputRef = useRef(null);


  function getApiBase() {
    return apiBase;
  }

  async function apiFetch(path, options) {
    const base = getApiBase();
    const res = await fetch(base + path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, options));
    return res;
  }

  function showToast(message, type) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, hiding: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, hiding: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 220);
    }, 3200);
  }

  async function loadApiPodInfo(base = apiBase) {
    try {
      setApiPodError("");

      const res = await fetch(`${base}/api-info`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setApiPod(await res.json());
    } catch {
      setApiPod(null);
      setApiPodError("Unable to load API pod information");
    }
  }

  async function checkHealth(base) {
    setHealthStatus({ state: "pending", text: "Health: checking…" });
    try {
      const res = await fetch((base ?? apiBase) + "/health", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        setHealthStatus({ state: "ok", text: "Health: OK" });
      } else {
        setHealthStatus({ state: "bad", text: "Health: Error " + res.status });
      }
    } catch {
      setHealthStatus({ state: "bad", text: "Health: Unreachable" });
    }
  }

  async function checkReady(base) {
    setReadyStatus({ state: "pending", text: "DB: checking…" });
    try {
      const res = await fetch((base ?? apiBase) + "/ready", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        setReadyStatus({ state: "ok", text: "DB: Reachable" });
      } else {
        setReadyStatus({ state: "bad", text: "DB: Unavailable" });
      }
    } catch {
      setReadyStatus({ state: "bad", text: "DB: Unreachable" });
    }
  }

  function refreshStatus(base) {
    checkHealth(base);
    checkReady(base);
  }

  async function loadCourses(base) {
    setListLoading(true);
    setListError(false);
    setListMessage("Loading courses…");

    try {
      const res = await fetch((base ?? apiBase) + "/courses", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (!res.ok) throw new Error("Request failed with status " + res.status);
      const data = await res.json();
      setAllCourses(Array.isArray(data) ? data : []);
    } catch {
      setAllCourses([]);
      setListError(true);
      setListMessage("Could not load courses. Check the API URL and that the server is running.");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    refreshStatus(apiBase);
    loadCourses(apiBase);
    loadApiPodInfo(apiBase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaveApiBase() {
    const cleaned = (apiBaseInputValue || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
    try {
      localStorage.setItem(STORAGE_KEY, cleaned);
    } catch {
      // ignore
    }
    setApiBaseState(cleaned);
    setApiBaseInputValue(cleaned);
    showToast("API base set to " + cleaned, "success");
    refreshStatus(cleaned);
    loadCourses(cleaned);
    loadApiPodInfo(cleaned);
  }

  function handleApiBaseKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveApiBase();
    }
  }

  const filteredCourses = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return allCourses;
    return allCourses.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  })();

  const showEmptyState = !listLoading && filteredCourses.length === 0;
  const emptyMessage = listError
    ? listMessage
    : allCourses.length === 0
    ? "No courses yet. Add your first course on the left."
    : "No courses match your search.";

  async function handleCreateCourse(e) {
    e.preventDefault();
    setFormError("");

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    setTitleInvalid(false);

    if (!trimmedTitle) {
      setTitleInvalid(true);
      setFormError("Title is required.");
      titleInputRef.current?.focus();
      return;
    }
    if (trimmedTitle.length > 160) {
      setTitleInvalid(true);
      setFormError("Title must be 160 characters or fewer.");
      return;
    }
    if (trimmedDescription.length > 2000) {
      setFormError("Description must be 2000 characters or fewer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/courses", {
        method: "POST",
        body: JSON.stringify({ title: trimmedTitle, description: trimmedDescription })
      });

      if (res.status === 201) {
        const course = await res.json();
        showToast('Course "' + course.title + '" created.', "success");
        setTitle("");
        setDescription("");
        await loadCourses();
      } else if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const msg = body && body.detail ? summarizeValidationError(body.detail) : "Validation failed.";
        setFormError(msg);
      } else {
        setFormError("Failed to create course (status " + res.status + ").");
      }
    } catch {
      setFormError("Could not reach the API. Check the API base URL and server status.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setTitle("");
    setDescription("");
    setFormError("");
    setTitleInvalid(false);
  }

  function openDeleteConfirm(id, courseTitle) {
    setPendingDelete({ id, title: courseTitle });
  }

  function closeDeleteConfirm() {
    setPendingDelete(null);
  }

  const [removingIds, setRemovingIds] = useState([]);

  async function performDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    closeDeleteConfirm();

    try {
      const res = await apiFetch("/courses/" + id, { method: "DELETE" });
      if (res.status === 204) {
        setRemovingIds((prev) => [...prev, id]);
        setTimeout(() => {
          setAllCourses((prev) => prev.filter((c) => c.id !== id));
          setRemovingIds((prev) => prev.filter((rid) => rid !== id));
        }, 180);
        showToast("Course deleted.", "success");
      } else if (res.status === 404) {
        showToast("Course not found (already deleted?).", "error");
        loadCourses();
      } else {
        showToast("Failed to delete course (status " + res.status + ").", "error");
      }
    } catch {
      showToast("Could not reach the API to delete the course.", "error");
    }
  }


  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && pendingDelete) closeDeleteConfirm();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SE</span>
          <span className="brand-name">Smart Education 2</span>
        </div>

        <div className="api-config">
          <label htmlFor="apiBase">API base URL</label>
          <input
            type="text"
            id="apiBase"
            placeholder={DEFAULT_API_BASE}
            value={apiBaseInputValue}
            onChange={(e) => setApiBaseInputValue(e.target.value)}
            onKeyDown={handleApiBaseKeyDown}
          />
          <button id="saveApiBase" className="btn btn-ghost" type="button" onClick={handleSaveApiBase}>
            Save
          </button>
        </div>

        <div className="status-group">
          <div className={`status-pill ${healthStatus.state}`} id="healthPill">
            <span className="dot"></span>
            <span className="status-text">{healthStatus.text}</span>
          </div>
          <div className={`status-pill ${readyStatus.state}`} id="readyPill">
            <span className="dot"></span>
            <span className="status-text">{readyStatus.text}</span>
          </div>
          <button
            id="refreshStatus"
            className="icon-btn"
            title="Refresh status"
            type="button"
            onClick={() => refreshStatus()}
          >
            ⟳
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="card form-card">
          <h2>Add a course</h2>
          <form id="courseForm" noValidate onSubmit={handleCreateCourse}>
            <div className="field">
              <label htmlFor="title">
                Title <span className="req">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                maxLength={160}
                placeholder="e.g. Introduction to Algebra"
                required
                ref={titleInputRef}
                className={titleInvalid ? "invalid" : ""}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) setTitleInvalid(false);
                }}
              />
              <div className="hint">
                <span id="titleCount">{title.length}</span>/160
              </div>
            </div>

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                maxLength={2000}
                rows={4}
                placeholder="Short description of the course (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="hint">
                <span id="descCount">{description.length}</span>/2000
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" id="submitBtn" disabled={submitting}>
                <span className="btn-label">{submitting ? "Creating…" : "Create course"}</span>
                <span className="spinner" hidden={!submitting}></span>
              </button>
              <button type="reset" className="btn btn-ghost" id="resetBtn" onClick={handleReset}>
                Clear
              </button>
            </div>

            {formError && (
              <p className="form-error" id="formError">
                {formError}
              </p>
            )}
          </form>
        </section>

        <section className="card list-card">
          <div className="list-header">
            <h2>Courses</h2>
            <div className="list-tools">
              <input
                type="search"
                id="searchInput"
                placeholder="Search courses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button id="reloadBtn" className="btn btn-ghost" type="button" onClick={() => loadCourses()}>
                Reload
              </button>
              <span className="count-badge" id="countBadge">
                {filteredCourses.length}
              </span>
            </div>
          </div>

          {(listLoading || showEmptyState) && (
            <div id="listState" className={`list-state ${listError ? "error" : ""}`}>
              {listLoading ? "Loading courses…" : emptyMessage}
            </div>
          )}

          {!listLoading && filteredCourses.length > 0 && (
            <ul className="course-list" id="courseList">
              {filteredCourses.map((course) => (
                <li
                  key={course.id}
                  className={`course-item ${removingIds.includes(course.id) ? "removing" : ""}`}
                  data-id={course.id}
                >
                  <div className="course-main">
                    <div className="course-id">
                      #<span className="id-value">{course.id}</span>
                    </div>
                    <div className="course-text">
                      <h3 className="course-title">{course.title}</h3>
                      <p className="course-desc">{course.description || ""}</p>
                    </div>
                  </div>
                  <div className="course-actions">
                    <button
                      className="icon-btn danger delete-btn"
                      title="Delete course"
                      type="button"
                      onClick={() => openDeleteConfirm(course.id, course.title)}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <section className="card api-pod-card" style={{ margin: "0 24px 24px" }}>
          <h2>API Pod Information</h2>
          {apiPodError ? (
            <p role="status">{apiPodError}</p>
          ) : apiPod ? (
            <>
              <p>
                <strong>Pod Name:</strong> {apiPod.pod_name}
              </p>
              <p>
                <strong>Pod IP:</strong> {apiPod.pod_ip}
              </p>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => loadApiPodInfo()}
              >
                Refresh
              </button>
            </>
          ) : (
            <p>Loading API pod information…</p>
          )}
      </section>

      <footer className="footer">
        <span>Smart Education API client</span>
        <span className="dot-sep">•</span>
        <span id="footerApiBase">{apiBase}</span>
      </footer>

      <div className="toast-container" id="toastContainer">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === "error" ? "error" : "success"} ${t.hiding ? "hide" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="modal-overlay" id="confirmOverlay" hidden={!pendingDelete} onClick={(e) => {
        if (e.target.id === "confirmOverlay") closeDeleteConfirm();
      }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <h3 id="confirmTitle">Delete this course?</h3>
          <p id="confirmBody">
            {pendingDelete ? `Delete "${pendingDelete.title}"? This action cannot be undone.` : "This action cannot be undone."}
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" id="confirmCancel" type="button" onClick={closeDeleteConfirm}>
              Cancel
            </button>
            <button className="btn btn-danger" id="confirmDelete" type="button" onClick={performDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
