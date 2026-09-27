.PHONY: test build

test:
	node Tests/model.test.cjs
	node Tests/recipe-import.test.cjs
	node Tests/regression.test.cjs
	node Tests/receipts.test.cjs
	node Tests/receipt-learning.test.cjs
	node Tests/receipt-parsing.test.cjs
	node Tests/receipt-products.test.cjs
	node Tests/margin-watch.test.cjs
	node Tests/refresh-contrast.test.cjs

build: test
	bash build.sh
