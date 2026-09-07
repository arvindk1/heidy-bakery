.PHONY: test build

test:
	node Tests/model.test.cjs
	node Tests/regression.test.cjs

build: test
	bash build.sh
