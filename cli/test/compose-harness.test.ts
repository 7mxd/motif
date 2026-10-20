import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DoctorDeps } from "../src/commands/doctor";
import { gradleCommand, ROBOLECTRIC_DOWNLOAD_FAILED, SHOT_TASK, splitJvmOptions } from "../src/stacks/compose/harness";
import { composeDoctor, gradleJava } from "../src/stacks/compose/doctor";

/** A machine with these java programs (path → version), and these files. */
function machine(javas: Record<string, string>, over: Partial<DoctorDeps> = {}, homes: Record<string, string> = {}): DoctorDeps {
  return {
    platform: "linux",
    arch: "x64",
    home: "/home/dev",
    findBrowser: () => null,
    which: () => null,
    files: { exists: (p) => p in javas, read: () => null, list: () => [] },
    run: (cmd) => {
      const version = javas[cmd[0]!];
      if (!version) return { code: 127, stdout: "" };
      const settings = cmd.includes("-XshowSettings:properties") && homes[cmd[0]!] ? `Property settings:\n    java.home = ${homes[cmd[0]!]}\n    java.version = ${version}\n` : "";
      return { code: 0, stdout: "", stderr: `${settings}openjdk version "${version}" 2024-07-16\n` };
    },
    ...over,
  };
}

describe("the JDK a Compose screenshot run uses (decision 0008)", () => {
  test("JAVA_HOME's java comes first, as gradlew takes it, when it is 17 or newer", () => {
    const deps = machine({ "/usr/bin/java": "11.0.2", "/opt/jdk17/bin/java": "17.0.12" }, { which: () => "/usr/bin/java", vars: { JAVA_HOME: "/opt/jdk17" } }, { "/opt/jdk17/bin/java": "/opt/jdk17" });
    expect(gradleJava(deps)).toEqual({ java: "/opt/jdk17/bin/java", javaHome: "/opt/jdk17" });
    expect(composeDoctor(deps, { root: "/p", apps: [] })[0]).toMatchObject({ status: "ok", detail: "JDK 17.0.12." });
  });

  test("a JAVA_HOME older than 17 is passed over for the PATH's java, and the home is the one the JVM reports", () => {
    const deps = machine(
      { "/usr/bin/java": "21.0.3", "/opt/jdk11/bin/java": "11.0.2" },
      { which: () => "/usr/bin/java", vars: { JAVA_HOME: "/opt/jdk11" } },
      // /usr/bin/java is a link; its JDK is elsewhere.
      { "/usr/bin/java": "/usr/lib/jvm/java-21-openjdk" },
    );
    expect(gradleJava(deps)).toEqual({ java: "/usr/bin/java", javaHome: "/usr/lib/jvm/java-21-openjdk" });
  });

  test("Android Studio's JDK is the last resort", () => {
    const studio = "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe";
    const deps = machine({ "C:\\Java\\bin\\java.exe": "11.0.2", [studio]: "21.0.5" }, { platform: "win32", which: () => "C:\\Java\\bin\\java.exe" });
    const got = gradleJava(deps);
    expect(got).toMatchObject({ java: studio });
    // Without java.home in what it printed, the home is two folders up from the program.
    expect("javaHome" in got && got.javaHome).toBe("C:\\Program Files\\Android\\Android Studio\\jbr");
  });

  test("with no java 17 or newer, the run is refused in doctor's words", () => {
    const old = machine({ "/opt/jdk11/bin/java": "11.0.2", "/usr/bin/java": "1.8.0_352" }, { which: () => "/usr/bin/java", vars: { JAVA_HOME: "/opt/jdk11" } });
    expect(gradleJava(old)).toEqual({ problem: "JDK 11.0.2 is older than 17, which Android's build needs." });
    expect(gradleJava(machine({}))).toEqual({
      problem: "No JDK found. Theme code, checks and drafts work without it; screenshots need JDK 17 or newer: install Android Studio (it brings one) or a JDK from https://adoptium.net.",
    });
  });
});

describe("the Gradle command", () => {
  test("starts the wrapper's jar with gradlew's JVM options, JAVA_OPTS and GRADLE_OPTS, and relative paths", () => {
    const cmd = gradleCommand("/jdk/bin/java", "/p/my app & co", "/p/my app & co/app", {
      JAVA_OPTS: "-Dhttps.proxyHost=proxy.local",
      GRADLE_OPTS: `-Xmx128m "-Dorg.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8" -Dname='a b'`,
    });
    expect(cmd).toEqual([
      "/jdk/bin/java",
      "-Xmx64m",
      "-Xms64m",
      "-Dhttps.proxyHost=proxy.local",
      "-Xmx128m",
      "-Dorg.gradle.jvmargs=-Xmx2g -Dfile.encoding=UTF-8",
      "-Dname=a b",
      "-Dorg.gradle.appname=gradlew",
      "-classpath",
      "gradle/wrapper/gradle-wrapper.jar",
      "org.gradle.wrapper.GradleWrapperMain",
      ":app:motifShots",
      "-I",
      "app/.motif/shot/init.gradle",
      "--console=plain",
    ]);
  });

  test("a nested module is its Gradle path, and an empty option list adds nothing", () => {
    const cmd = gradleCommand("java", "/p", "/p/apps/android", {});
    expect(cmd).toContain(":apps:android:motifShots");
    expect(cmd).toContain("apps/android/.motif/shot/init.gradle");
    expect(splitJvmOptions(undefined)).toEqual([]);
    expect(splitJvmOptions("  ")).toEqual([]);
  });
});

describe("Robolectric's failed download", () => {
  // Gradle's plain console when Robolectric couldn't reach its repository (decision 0008: the download pointed at a
  // closed port, Robolectric's Android jar not yet on the machine).
  const CAPTURED = `> Task :app:testDebugUnitTest FAILED

MotifShotTest > classMethod FAILED
    java.lang.AssertionError at MavenArtifactFetcher.java:130
        Caused by: java.util.concurrent.ExecutionException at AbstractFuture.java:168
            Caused by: java.net.ConnectException at null:-2

1 test completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:testDebugUnitTest'.
> There were failing tests. See the report at: file:///C:/tmp/off/repo/app/build/reports/tests/testDebugUnitTest/index.html`;

  test("is told apart from other failures", () => {
    expect(ROBOLECTRIC_DOWNLOAD_FAILED.test(CAPTURED)).toBe(true);
    expect(ROBOLECTRIC_DOWNLOAD_FAILED.test("java.lang.AssertionError: Failed to fetch maven artifact org.robolectric:android-all-instrumented:15-robolectric-13954326-i7")).toBe(true);
    expect(ROBOLECTRIC_DOWNLOAD_FAILED.test("MotifShotTest > shots FAILED\n    java.lang.IllegalStateException at MotifShotTest.kt:90")).toBe(false);
  });
});

describe("the init script", () => {
  const script = readFileSync(join(import.meta.dir, "../src/stacks/compose/harness/init.gradle"), "utf8");

  test("adds the harness folder to the test sources for Java and Kotlin: AGP 9's built-in Kotlin compiles only the Kotlin folders (Task 15)", () => {
    // Found on JetNews (AGP 9.3.1): with the folder only under java, compileDebugUnitTestKotlin said NO-SOURCE and nothing was drawn.
    const dsl = script.slice(script.indexOf("finalizeDsl"), script.indexOf("project.dependencies"));
    expect(dsl).toContain('getByName("test")');
    expect(dsl).toMatch(/\.java\.srcDir\(new File\(shotDir, "src"\)\)/);
    expect(dsl).toMatch(/\.kotlin\.srcDir\(new File\(shotDir, "src"\)\)/);
  });
  test("Motif runs its own task, motifShots, which runs the first debug variant's unit tests: an app with product flavours has no testDebugUnitTest", () => {
    expect(SHOT_TASK).toBe("motifShots");
    expect(script).toContain('project.tasks.register("motifShots")');
    // The variant is the Android plugin's own (androidComponents), not a task name Motif guesses.
    expect(script).toMatch(/androidComponents\.onVariants\(/);
    expect(script).toMatch(/variant\.buildType == "debug"/);
    // --tests can't be given to a task that isn't a test task: the script narrows the run to the harness as --tests does.
    expect(script).toContain('setTestNameIncludePatterns(["dev.motif.shot.MotifShotTest"])');
  });
});
