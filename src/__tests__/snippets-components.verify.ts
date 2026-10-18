import http from "http";
import app from "../index";

async function runSnippetsAndComponentsTests() {
  console.log("--- Starting DevDash Snippets & Components API Verification ---");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5997, resolve));
  const baseUrl = "http://localhost:5997";

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
    // 1. Snippets Unauthorized
    const unauthSnippetsRes = await fetch(`${baseUrl}/api/v1/snippets`);
    const unauthSnippetsData: any = await unauthSnippetsRes.json();
    assert(
      unauthSnippetsRes.status === 401 &&
        unauthSnippetsData.success === false &&
        unauthSnippetsData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/snippets without token returns 401 UNAUTHORIZED",
      unauthSnippetsData
    );

    // 2. Snippets Validation Error (Empty Code)
    const invalidSnippetRes = await fetch(`${baseUrl}/api/v1/snippets`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_snip",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Test Snippet",
        language: "typescript",
        code: "", // Empty code
      }),
    });
    const invalidSnippetData: any = await invalidSnippetRes.json();
    assert(
      invalidSnippetRes.status === 400 &&
        invalidSnippetData.success === false &&
        invalidSnippetData.error?.code === "VALIDATION_ERROR",
      "POST /api/v1/snippets with empty code returns 400 VALIDATION_ERROR",
      invalidSnippetData
    );

    // 3. Components Unauthorized
    const unauthCompRes = await fetch(`${baseUrl}/api/v1/components`);
    const unauthCompData: any = await unauthCompRes.json();
    assert(
      unauthCompRes.status === 401 &&
        unauthCompData.success === false &&
        unauthCompData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/components without token returns 401 UNAUTHORIZED",
      unauthCompData
    );

    // 4. Components Validation Error (Invalid Framework)
    const invalidCompRes = await fetch(`${baseUrl}/api/v1/components`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_comp",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Button",
        framework: "ANGULAR_INVALID",
        styling: "TAILWIND",
        code: "<button>test</button>",
      }),
    });
    const invalidCompData: any = await invalidCompRes.json();
    assert(
      invalidCompRes.status === 400 &&
        invalidCompData.success === false &&
        invalidCompData.error?.code === "VALIDATION_ERROR",
      "POST /api/v1/components with invalid framework returns 400 VALIDATION_ERROR",
      invalidCompData
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
      "\nVERDICT: PASS -- All Snippets and Components API contract invariants verified successfully!"
    );
    process.exit(0);
  }
}

runSnippetsAndComponentsTests();
