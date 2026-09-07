.PHONY: test build

test:
	node Tests/model.test.cjs
	node Tests/regression.test.cjs
	node Tests/margin-watch.test.cjs

build: test
	bash build.sh
