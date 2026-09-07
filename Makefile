.PHONY: all build test selftest clean run zip seed

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

selftest: seed
	@mkdir -p test_data
	@HEIDY_DATA_DIR="$(shell pwd)/test_data" "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --self-test
	@rm -rf test_data

build: seed
	./HeidyBakery/build.sh

run:
	open "HeidyBakery/Heidy Bakery.app"

clean:
	rm -rf test_data
