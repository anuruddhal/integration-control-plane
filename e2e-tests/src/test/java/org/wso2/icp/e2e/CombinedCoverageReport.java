package org.wso2.icp.e2e;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Emits one Ballerina line-coverage report merging every supplied JaCoCo exec dump — typically the
 * E2E suite dumps (JaCoCo agent on the packaged server) plus the `bal test --code-coverage` dump.
 * All are analysed against the same built ICP jar; JaCoCo unions probes per class id.
 *
 * <p>Args: {@code <icp-server.jar> <ballerinaSourceRoot> <outputDir> <exec>...}
 *
 * <p>Optional {@code -Dicp.coverage.min=<percent>} fails the build when combined line coverage falls
 * below the threshold, so CI can gate on it.
 */
public final class CombinedCoverageReport {
    private CombinedCoverageReport() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 4) {
            throw new IllegalArgumentException("Usage: <icp-server.jar> <sourceRoot> <outputDir> <exec>...");
        }
        Path jar = Path.of(args[0]);
        Path sourceRoot = Path.of(args[1]);
        Path outputDir = Path.of(args[2]);
        Path[] execs = new Path[args.length - 3];
        for (int i = 3; i < args.length; i++) execs[i - 3] = Path.of(args[i]);

        double coverage = BallerinaCoverageReport.write(jar, outputDir, sourceRoot,
                "ICP combined line coverage (E2E + Ballerina unit tests)", execs);
        String percent = String.format(Locale.ROOT, "%.2f", coverage);
        Files.writeString(outputDir.resolve("coverage.txt"), percent + "\n");
        System.out.println("Combined ICP Ballerina line coverage: " + percent + "% -> "
                + outputDir.resolve("html/index.html"));

        String min = System.getProperty("icp.coverage.min");
        if (min != null && !min.isBlank() && coverage < Double.parseDouble(min.trim())) {
            throw new AssertionError("Combined line coverage " + percent + "% is below the required "
                    + min.trim() + "%");
        }
    }
}
