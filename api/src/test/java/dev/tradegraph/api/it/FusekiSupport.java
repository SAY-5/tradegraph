package dev.tradegraph.api.it;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

/** Starts one Fuseki container per JVM and loads RDF into it over the Graph Store Protocol. */
final class FusekiSupport {

    static final String GRAPH_ENTITIES = "https://tradegraph.dev/graph/entities";
    static final String GRAPH_POSITIONS = "https://tradegraph.dev/graph/positions";

    private static final String IMAGE = System.getProperty("fuseki.image", "secoresearch/fuseki:5.6.0");
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private FusekiSupport() {
    }

    /**
     * The same image with the assembler from {@code deploy/fuseki} copied in, which adds a
     * second read only service at {@code /ds-inf} over a Jena generic rule reasoner.
     */
    static GenericContainer<?> startWithInference() {
        return configure(new GenericContainer<>(DockerImageName.parse(IMAGE))
                .withCopyFileToContainer(MountableFile.forHostPath("../deploy/fuseki/assembler-inference.ttl"),
                        "/fuseki-base/configuration/assembler.ttl")
                .withCopyFileToContainer(MountableFile.forHostPath("../deploy/fuseki/tradegraph.rules"),
                        "/fuseki-base/configuration/tradegraph.rules"));
    }

    static GenericContainer<?> start() {
        return configure(new GenericContainer<>(DockerImageName.parse(IMAGE)));
    }

    private static GenericContainer<?> configure(GenericContainer<?> base) {
        GenericContainer<?> container = base
                .withEnv("ADMIN_PASSWORD", "admin")
                .withEnv("ENABLE_DATA_WRITE", "true")
                .withEnv("ENABLE_UPDATE", "true")
                .withEnv("QUERY_TIMEOUT", "60000")
                .withExposedPorts(3030)
                .waitingFor(Wait.forHttp("/$/ping").forPort(3030).withStartupTimeout(Duration.ofMinutes(3)));
        container.start();
        Runtime.getRuntime().addShutdownHook(new Thread(container::stop));
        return container;
    }

    static String baseUrl(GenericContainer<?> c) {
        return "http://" + c.getHost() + ":" + c.getMappedPort(3030) + "/ds";
    }

    static String queryUrl(GenericContainer<?> c) {
        return baseUrl(c) + "/sparql";
    }

    /** Query endpoint of the reasoning service added by {@link #startWithInference()}. */
    static String inferenceQueryUrl(GenericContainer<?> c) {
        return "http://" + c.getHost() + ":" + c.getMappedPort(3030) + "/ds-inf/sparql";
    }

    static void putGraph(GenericContainer<?> c, String graph, Path file, String contentType) {
        try {
            String url = baseUrl(c) + "/data?graph=" + URLEncoder.encode(graph, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", contentType)
                    .timeout(Duration.ofMinutes(5))
                    .PUT(HttpRequest.BodyPublishers.ofFile(file))
                    .build();
            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                throw new IllegalStateException("graph store PUT failed: " + resp.statusCode() + " " + resp.body());
            }
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    static void loadFixture(GenericContainer<?> c) {
        loadFixture(c, "/fixture.ttl");
    }

    static void loadFixture(GenericContainer<?> c, String resource) {
        try {
            Path fixture = Path.of(FusekiSupport.class.getResource(resource).toURI());
            putGraph(c, GRAPH_ENTITIES, fixture, "text/turtle");
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sample built by {@code make etl-sample}; null when it has not been produced. */
    static Path sampleBuildDir() {
        Path dir = Path.of("..", "etl", "build").toAbsolutePath().normalize();
        return Files.exists(dir.resolve("entities.nt")) && Files.exists(dir.resolve("positions.nt")) ? dir : null;
    }
}
