package dev.tradegraph.api.model;

/** One hop of a lineage explanation: {@code hop} is how this entity was reached from the previous step. */
public record PathStep(String id, String name, String hop) {

    public static final String START = "start";
    public static final String PARENT = "parent";
    public static final String SUBSIDIARY = "subsidiary";
    public static final String HOLDS = "holds";
}
