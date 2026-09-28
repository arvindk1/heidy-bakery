.PHONY: all build test selftest clean run zip seed release release-check

SEED := HeidyBakery/Resources/seed.json

seed:
	@if [ ! -f "$(SEED)" ]; then \
		cp HeidyBakery/Resources/seed.example.json "$(SEED)"; \
		echo "No private seed.json found - using synthetic example data."; \
	fi

all: test selftest

test: seed
	node HeidyBakery/Tests/model.test.cjs
	node HeidyBakery/Tests/regression.test.cjs
	node HeidyBakery/Tests/margin-watch.test.cjs
	node HeidyBakery/Tests/refresh-contrast.test.cjs

selftest: seed
	@mkdir -p test_data
	@HEIDY_DATA_DIR="$(shell pwd)/test_data" "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --self-test
	@rm -rf test_data

build: seed
	./HeidyBakery/build.sh

# Real release: requires HEIDY_SIGN_IDENTITY, HEIDY_INSTALLER_IDENTITY and
# HEIDY_NOTARY_PROFILE in the environment. Never falls back to the synthetic
# seed — a release build needs Heidy's real Resources/seed.json.
release:
	./HeidyBakery/release.sh

# Preflight + version guard + tests only; no signing, build or delivery.
release-check:
	./HeidyBakery/release.sh --check

run:
	open "HeidyBakery/Heidy Bakery.app"

clean:
	rm -rf test_data
