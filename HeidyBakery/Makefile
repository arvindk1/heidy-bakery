.PHONY: test build

test:
	npm test

build: test
	bash build.sh

.PHONY: release release-check
release:
	bash release.sh

release-check:
	bash release.sh --check
