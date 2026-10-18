import http from "http";
import app from "../index";

async function runPhase4BackendTests() {
  console.log("--- Starting DevDash Phase 4 Backend Verification ---");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5996, resolve));
  const baseUrl = "http://localhost:5996";

  let failures = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
    } else {
      console.error(`❌ FAIL: ${testName}`, detail || "");
      failures++;
    }
  }

  try {
    // 1. Bookmarks Unauthorized
    const unauthBmRes = await fetch(`${baseUrl}/api/v1/bookmarks`);
    const unauthBmData: any = await unauthBmRes.json();
    assert(
      unauthBmRes.status === 401 &&
        unauthBmData.success === false &&
        unauthBmData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/bookmarks without token returns 401 UNAUTHORIZED",
      unauthBmData
    );

    // 2. Bookmarks Validation Error (Invalid URL)
    const invalidBmRes = await fetch(`${baseUrl}/api/v1/bookmarks`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_bm",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Test Bookmark",
        url: "not-a-valid-url",
      }),
    });
    const invalidBmData: any = await invalidBmRes.json();
    assert(
      invalidBmRes.status === 400 &&
        invalidBmData.success === false &&
        invalidBmData.error?.code === "VALIDATION_ERROR",
      "POST /api/v1/bookmarks with invalid url returns 400 VALIDATION_ERROR",
      invalidBmData
    );

    // 3. Notes Unauthorized
    const unauthNotesRes = await fetch(`${baseUrl}/api/v1/notes`);
    const unauthNotesData: any = await unauthNotesRes.json();
    assert(
      unauthNotesRes.status === 401 &&
        unauthNotesData.success === false &&
        unauthNotesData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/notes without token returns 401 UNAUTHORIZED",
      unauthNotesData
    );

    // 4. Notes Validation Error (Empty Content)
    const invalidNoteRes = await fetch(`${baseUrl}/api/v1/notes`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_note",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "My Note",
        content: "",
      }),
    });
    const invalidNoteData: any = await invalidNoteRes.json();
    assert(
      invalidNoteRes.status === 400 &&
        invalidNoteData.success === false &&
        invalidNoteData.error?.code === "VALIDATION_ERROR",
      "POST /api/v1/notes with empty content returns 400 VALIDATION_ERROR",
      invalidNoteData
    );

    // 5. Global Search Unauthorized
    const unauthSearchRes = await fetch(`${baseUrl}/api/v1/search?q=test`);
    const unauthSearchData: any = await unauthSearchRes.json();
    assert(
      unauthSearchRes.status === 401 &&
        unauthSearchData.success === false &&
        unauthSearchData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/search without token returns 401 UNAUTHORIZED",
      unauthSearchData
    );

    // 6. Weekly Digest Unauthorized
    const unauthDigestRes = await fetch(`${baseUrl}/api/v1/digest/preview`);
    const unauthDigestData: any = await unauthDigestRes.json();
    assert(
      unauthDigestRes.status === 401 &&
        unauthDigestData.success === false &&
        unauthDigestData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/digest/preview without token returns 401 UNAUTHORIZED",
      unauthDigestData
    );
  } catch (err) {
    console.error("Test threw error:", err);
    failures++;
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nVERDICT: FAIL -- ${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log(
      "\nVERDICT: PASS -- All Phase 4 backend endpoints verified successfully!"
    );
    process.exit(0);
  }
}

runPhase4BackendTests();
