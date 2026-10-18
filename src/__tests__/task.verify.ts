import http from "http";
import app from "../index";

async function runTaskTests() {
  console.log("--- Starting DevDash Task API Verification ---");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5998, resolve));
  const baseUrl = "http://localhost:5998";

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
    // 1. Unauthorized GET /api/v1/tasks
    const unauthRes = await fetch(`${baseUrl}/api/v1/tasks`);
    const unauthData: any = await unauthRes.json();
    assert(
      unauthRes.status === 401 &&
        unauthData.success === false &&
        unauthData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/tasks without token returns 401 UNAUTHORIZED",
      unauthData
    );

    // 2. Unauthorized POST /api/v1/tasks
    const unauthPostRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Task" }),
    });
    const unauthPostData: any = await unauthPostRes.json();
    assert(
      unauthPostRes.status === 401 &&
        unauthPostData.success === false &&
        unauthPostData.error?.code === "UNAUTHORIZED",
      "POST /api/v1/tasks without token returns 401 UNAUTHORIZED",
      unauthPostData
    );

    // 3. Validation Error: Empty Title
    const invalidTitleRes = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_tasks",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "",
        status: "TODO",
      }),
    });
    const invalidTitleData: any = await invalidTitleRes.json();
    assert(
      invalidTitleRes.status === 400 &&
        invalidTitleData.success === false &&
        invalidTitleData.error?.code === "VALIDATION_ERROR",
      "POST /api/v1/tasks with empty title returns 400 VALIDATION_ERROR",
      invalidTitleData
    );

    // 4. Validation Error: Invalid Priority Query Param
    const invalidPriorityRes = await fetch(
      `${baseUrl}/api/v1/tasks?priority=CRITICAL`,
      {
        headers: { Authorization: "Bearer dev_user_tasks" },
      }
    );
    const invalidPriorityData: any = await invalidPriorityRes.json();
    assert(
      invalidPriorityRes.status === 400 &&
        invalidPriorityData.success === false &&
        invalidPriorityData.error?.code === "VALIDATION_ERROR",
      "GET /api/v1/tasks?priority=CRITICAL returns 400 VALIDATION_ERROR",
      invalidPriorityData
    );

    // 5. Validation Error: Invalid Status in PATCH /status
    const invalidPatchRes = await fetch(
      `${baseUrl}/api/v1/tasks/123e4567-e89b-12d3-a456-426614174000/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer dev_user_tasks",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "NOT_A_REAL_STATUS" }),
      }
    );
    const invalidPatchData: any = await invalidPatchRes.json();
    assert(
      invalidPatchRes.status === 400 &&
        invalidPatchData.success === false &&
        invalidPatchData.error?.code === "VALIDATION_ERROR",
      "PATCH /api/v1/tasks/:id/status with invalid status returns 400 VALIDATION_ERROR",
      invalidPatchData
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
      "\nVERDICT: PASS -- All Task API contract invariants verified successfully!"
    );
    process.exit(0);
  }
}

runTaskTests();
