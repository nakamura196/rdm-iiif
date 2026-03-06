FROM eclipse-temurin:17-jre

ARG CANTALOUPE_VERSION=5.0.6

WORKDIR /opt/cantaloupe

# Download and extract Cantaloupe
RUN apt-get update && apt-get install -y curl unzip \
    && curl -L -o cantaloupe.zip https://github.com/cantaloupe-project/cantaloupe/releases/download/v${CANTALOUPE_VERSION}/cantaloupe-${CANTALOUPE_VERSION}.zip \
    && unzip cantaloupe.zip \
    && mv cantaloupe-${CANTALOUPE_VERSION}/* . \
    && rm -rf cantaloupe-${CANTALOUPE_VERSION} cantaloupe.zip \
    && apt-get remove -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Create cache directory
RUN mkdir -p /var/cache/cantaloupe

EXPOSE 8182

CMD ["java", "-Dcantaloupe.config=/etc/cantaloupe/cantaloupe.properties", "-jar", "cantaloupe-5.0.6.jar"]
