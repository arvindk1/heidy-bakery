.PHONY: all build test selftest pdf clean run zip seed

SEED := HeidyBakery/Resources/seed.json

seed:
	@if [ ! -f "$(SEED)" ]; then \
		cp HeidyBakery/Resources/seed.example.json "$(SEED)"; \
		echo "No private seed.json found - using synthetic example data."; \
	fi

all: test selftest pdf

test: seed
	node HeidyBakery/Tests/model.test.cjs

selftest: seed
	@mkdir -p test_data
	@HEIDY_DATA_DIR="$(shell pwd)/test_data" "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --self-test
	@rm -rf test_data

pdf:
	@/opt/homebrew/bin/python3.12 scripts/generate_guide_pdf.py

build: seed
	./HeidyBakery/build.sh

run:
	open "HeidyBakery/Heidy Bakery.app"

clean:
	rm -rf test_data
