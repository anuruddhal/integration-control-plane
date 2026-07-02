package org.wso2.icp.e2e;

import org.jacoco.core.analysis.Analyzer;
import org.jacoco.core.analysis.CoverageBuilder;
import org.jacoco.core.analysis.IBundleCoverage;
import org.jacoco.core.analysis.ICounter;
import org.jacoco.core.analysis.ILine;
import org.jacoco.core.analysis.ISourceFileCoverage;
import org.jacoco.core.tools.ExecFileLoader;
import org.jacoco.report.IReportVisitor;
import org.jacoco.report.ISourceFileLocator;
import org.jacoco.report.xml.XMLFormatter;

import java.io.IOException;
import java.io.OutputStream;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class BallerinaCoverageReport {
    private static final String ICP_CLASS_PREFIX = "wso2/icp_server";
    private static final String ROOT_PACKAGE = "icp_server";
    private static final String MODULE_SEPARATOR = "&0046";

    private BallerinaCoverageReport() {
    }

    // JaCoCo merges probes for identical class ids across exec files, so passing both the E2E dump and
    // the `bal test --code-coverage` dump yields a single union of covered .bal lines.
    // Returns the total line-coverage percentage (0..100).
    static double write(Path icpServerJar, Path reportDir, Path sourceRoot, String title, Path... execFiles)
            throws IOException {
        Files.createDirectories(reportDir);
        List<Path> execs = new ArrayList<>();
        for (Path exec : execFiles) {
            if (exec != null && Files.exists(exec) && Files.size(exec) > 0) execs.add(exec);
        }
        if (execs.isEmpty()) {
            Files.writeString(reportDir.resolve("summary.md"), "# " + title + "\n\nNo JaCoCo execution data was written.\n");
            return 0.0;
        }

        Path classesDir = reportDir.resolve("classes");
        recreate(classesDir);
        extractClasses(icpServerJar, classesDir);

        ExecFileLoader loader = new ExecFileLoader();
        for (Path exec : execs) loader.load(exec.toFile());
        CoverageBuilder builder = new CoverageBuilder();
        new Analyzer(loader.getExecutionDataStore(), builder).analyzeAll(classesDir.toFile());
        IBundleCoverage bundle = builder.getBundle("icp-server-e2e-ballerina");
        SourceLocator sources = new SourceLocator(sourceRoot);
        Map<String, SourceStats> coverage = mergeBallerinaSources(builder, sources);

        writeXml(reportDir.resolve("jacoco.xml"), sources, loader, bundle);
        writeSummary(reportDir.resolve("summary.md"), title, coverage);
        writeBallerinaHtml(reportDir.resolve("html"), title, coverage, sources);
        delete(classesDir);

        int covered = coverage.values().stream().mapToInt(SourceStats::coveredCount).sum();
        int total = covered + coverage.values().stream().mapToInt(SourceStats::missedCount).sum();
        return total == 0 ? 0.0 : 100.0 * covered / total;
    }

    private static void writeXml(Path output, ISourceFileLocator sources, ExecFileLoader loader,
                                 IBundleCoverage bundle) throws IOException {
        try (OutputStream out = Files.newOutputStream(output)) {
            writeReport(new XMLFormatter().createVisitor(out), sources, loader, bundle);
        }
    }

    private static void writeReport(IReportVisitor visitor, ISourceFileLocator sources, ExecFileLoader loader,
                                    IBundleCoverage bundle) throws IOException {
        visitor.visitInfo(loader.getSessionInfoStore().getInfos(), loader.getExecutionDataStore().getContents());
        visitor.visitBundle(bundle, sources);
        visitor.visitEnd();
    }

    private static Map<String, SourceStats> mergeBallerinaSources(CoverageBuilder builder, SourceLocator sources) {
        Map<String, SourceStats> coverage = new TreeMap<>();
        for (ISourceFileCoverage source : builder.getSourceFiles()) {
            if (!source.getName().endsWith(".bal")) continue;
            String path = sources.sourcePath(source.getPackageName(), source.getName());
            if (path == null) continue;
            SourceStats stats = coverage.computeIfAbsent(path, SourceStats::new);
            for (int line = source.getFirstLine(); line <= source.getLastLine(); line++) {
                ILine status = source.getLine(line);
                if (status.getStatus() == ICounter.PARTLY_COVERED || status.getStatus() == ICounter.FULLY_COVERED) {
                    stats.cover(line);
                } else if (status.getStatus() == ICounter.NOT_COVERED) {
                    stats.miss(line);
                }
            }
        }
        return coverage;
    }

    private static void writeSummary(Path output, String title, Map<String, SourceStats> coverage) throws IOException {
        int covered = coverage.values().stream().mapToInt(SourceStats::coveredCount).sum();
        int missed = coverage.values().stream().mapToInt(SourceStats::missedCount).sum();
        StringBuilder markdown = new StringBuilder("# ").append(title).append("\n\n")
                .append("Generated: ").append(Instant.now()).append("\n\n")
                .append("## Total\n\n")
                .append(summaryLine(covered, missed)).append("\n\n")
                .append("## By source file\n\n")
                .append("| Source | Covered | Missed | Line coverage |\n")
                .append("|---|---:|---:|---:|\n");
        coverage.values().forEach(stats -> markdown.append("| `")
                .append(stats.path).append("` | ")
                .append(stats.coveredCount()).append(" | ")
                .append(stats.missedCount()).append(" | ")
                .append(percentage(stats.coveredCount(), stats.total())).append("% |\n"));
        Files.writeString(output, markdown.toString());
    }

    private static void writeBallerinaHtml(Path output, String title, Map<String, SourceStats> coverage,
                                           SourceLocator sources) throws IOException {
        recreate(output);
        Map<String, String> pages = new LinkedHashMap<>();
        for (SourceStats stats : coverage.values()) {
            String page = htmlFile(stats.path);
            pages.put(stats.path, page);
            Files.writeString(output.resolve(page), sourceHtml(stats, sources.source(stats.path)));
        }
        Files.writeString(output.resolve("index.html"), indexHtml(title, coverage, pages));
    }

    private static String indexHtml(String title, Map<String, SourceStats> coverage, Map<String, String> pages) {
        int covered = coverage.values().stream().mapToInt(SourceStats::coveredCount).sum();
        int missed = coverage.values().stream().mapToInt(SourceStats::missedCount).sum();
        StringBuilder html = htmlStart(title)
                .append("<h1>").append(escape(title)).append("</h1>")
                .append("<p>Generated: ").append(escape(Instant.now().toString())).append("</p>")
                .append("<h2>Total: ").append(summaryText(covered, missed)).append("</h2>")
                .append("<table><thead><tr><th>Source</th><th>Covered</th><th>Missed</th><th>Line coverage</th></tr></thead><tbody>");
        coverage.values().forEach(stats -> html.append("<tr><td><a href=\"")
                .append(pages.get(stats.path)).append("\">").append(escape(stats.path)).append("</a></td><td>")
                .append(stats.coveredCount()).append("</td><td>")
                .append(stats.missedCount()).append("</td><td>")
                .append(percentage(stats.coveredCount(), stats.total())).append("%</td></tr>"));
        return html.append("</tbody></table>").append(htmlEnd()).toString();
    }

    private static String sourceHtml(SourceStats stats, String source) {
        StringBuilder html = htmlStart(stats.path)
                .append("<h1>").append(escape(stats.path)).append("</h1>")
                .append("<p><a href=\"index.html\">Back to index</a></p>")
                .append("<h2>").append(summaryText(stats.coveredCount(), stats.missedCount())).append("</h2>")
                .append("<pre class=\"source\">");
        String[] lines = source.split("\\R", -1);
        for (int i = 0; i < lines.length; i++) {
            int line = i + 1;
            String status = stats.covered.contains(line) ? "covered" : stats.missed.contains(line) ? "missed" : "empty";
            html.append("<span class=\"").append(status).append("\"><span class=\"line\">")
                    .append(String.format(Locale.ROOT, "%4d", line)).append("</span> ")
                    .append(escape(lines[i])).append("</span>\n");
        }
        return html.append("</pre>").append(htmlEnd()).toString();
    }

    private static StringBuilder htmlStart(String title) {
        return new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"><title>")
                .append(escape(title)).append("</title><style>")
                .append("body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin:2rem;color:#111}")
                .append("table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.4rem;text-align:left}th{background:#f4f4f4}")
                .append("pre.source{border:1px solid #ddd;line-height:1.45;overflow:auto}.line{color:#777;user-select:none}")
                .append(".covered{display:block;background:#e6ffed}.missed{display:block;background:#ffeef0}.empty{display:block;background:#fff}")
                .append("</style></head><body>");
    }

    private static String htmlEnd() {
        return "</body></html>";
    }

    private static String htmlFile(String path) {
        return path.replaceAll("[^A-Za-z0-9._-]", "_") + ".html";
    }

    private static String summaryLine(int covered, int missed) {
        return String.format(Locale.ROOT, "**%s%%** (%d/%d lines covered)", percentage(covered, covered + missed),
                covered, covered + missed);
    }

    private static String summaryText(int covered, int missed) {
        return String.format(Locale.ROOT, "%s%% (%d/%d lines covered)", percentage(covered, covered + missed),
                covered, covered + missed);
    }

    private static String percentage(int covered, int total) {
        return total == 0 ? "0.00" : String.format(Locale.ROOT, "%.2f", 100.0 * covered / total);
    }

    private static String escape(String text) {
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static final class SourceLocator implements ISourceFileLocator {
        private final Path sourceRoot;
        private final Map<String, Path> paths = new HashMap<>();

        SourceLocator(Path sourceRoot) throws IOException {
            this.sourceRoot = sourceRoot;
            if (!Files.isDirectory(sourceRoot)) return;
            try (var walk = Files.walk(sourceRoot)) {
                walk.filter(path -> path.getFileName().toString().endsWith(".bal"))
                        .forEach(path -> paths.put(sourceRoot.relativize(path).toString().replace('\\', '/'), path));
            }
        }

        @Override
        public Reader getSourceFile(String packageName, String fileName) throws IOException {
            String path = sourcePath(packageName, fileName);
            return path == null ? null : Files.newBufferedReader(paths.get(path), StandardCharsets.UTF_8);
        }

        @Override
        public int getTabWidth() {
            return 4;
        }

        String source(String path) throws IOException {
            Path file = paths.get(path);
            return file == null ? "" : Files.readString(file);
        }

        String sourcePath(String packageName, String fileName) {
            String module = module(packageName);
            if (module == null) return null;
            String path = module.equals(ROOT_PACKAGE) ? fileName : "modules/" + module.substring(ROOT_PACKAGE.length() + 1) + "/" + fileName;
            return paths.containsKey(path) ? path : null;
        }

        private static String module(String packageName) {
            String[] parts = packageName.split("/");
            if (parts.length < 2) return null;
            String encoded = parts[1];
            if (!encoded.equals(ROOT_PACKAGE) && !encoded.startsWith(ROOT_PACKAGE + MODULE_SEPARATOR)) return null;
            return encoded.replace(MODULE_SEPARATOR, ".");
        }
    }

    private static final class SourceStats {
        private final String path;
        private final Set<Integer> covered = new TreeSet<>();
        private final Set<Integer> missed = new TreeSet<>();

        private SourceStats(String path) {
            this.path = path;
        }

        void cover(int line) {
            missed.remove(line);
            covered.add(line);
        }

        void miss(int line) {
            if (!covered.contains(line)) missed.add(line);
        }

        int coveredCount() {
            return covered.size();
        }

        int missedCount() {
            return missed.size();
        }

        int total() {
            return coveredCount() + missedCount();
        }
    }

    private static void extractClasses(Path jar, Path target) throws IOException {
        try (ZipInputStream stream = new ZipInputStream(Files.newInputStream(jar))) {
            ZipEntry entry;
            while ((entry = stream.getNextEntry()) != null) {
                String name = entry.getName();
                if (entry.isDirectory() || !name.startsWith(ICP_CLASS_PREFIX) || !name.endsWith(".class")) continue;
                Path output = target.resolve(name).normalize();
                if (!output.startsWith(target)) throw new IOException("Unsafe jar entry: " + name);
                Files.createDirectories(output.getParent());
                Files.copy(stream, output);
            }
        }
    }

    private static void recreate(Path path) throws IOException {
        if (Files.exists(path)) delete(path);
        Files.createDirectories(path);
    }

    private static void delete(Path path) throws IOException {
        try (var paths = Files.walk(path)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        }
    }
}
